// Package server 提供统一的服务启动模板，
// 同时运行 gRPC（业务）+ HTTP（healthz、metrics）并支持优雅关停。
package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/yym108/gobao-pkg/grpcx"
)

// Options 描述服务的启动配置。
type Options struct {
	HTTPAddr     string               // HTTP 监听地址，如 ":8080"；"127.0.0.1:0" 表示自动分配端口
	GRPCAddr     string               // gRPC 监听地址，如 ":9090"
	Register     func(*grpc.Server)   // 业务 gRPC 服务注册回调（如注册 UserServiceServer），可为 nil
	GRPCOpts     []grpc.ServerOption  // gRPC ServerOption，用于传入拦截器等配置
	HTTPRegister func(*http.ServeMux) // 额外 HTTP 路由注册回调，用于扩展静态资源或管理接口
}

// Server 同时持有 gRPC 和 HTTP 两个服务实例，统一管理生命周期。
type Server struct {
	name   string       // 服务名称，用于日志标识
	opts   Options      // 启动配置
	grpc   *grpc.Server // gRPC 服务实例
	http   *http.Server // HTTP 服务实例（healthz、readyz、metrics）
	mu     sync.Mutex   // 保护 httpLn/grpcLn 的并发读写
	httpLn net.Listener // HTTP 监听器
	grpcLn net.Listener // gRPC 监听器
}

// New 构造 Server，此时不监听端口，调用 Run 后才启动。
//   - name: 服务名称（如 "user"、"order"）
//   - opts: 启动配置
func New(name string, opts Options) *Server {
	return &Server{name: name, opts: opts}
}

// HTTPListenAddr 返回 HTTP 实际监听地址（端口为 0 时用于获取自动分配的端口）。
// Run 尚未执行时返回空字符串。并发安全。
func (s *Server) HTTPListenAddr() string {
	s.mu.Lock()
	ln := s.httpLn
	s.mu.Unlock()
	if ln == nil {
		return ""
	}
	return ln.Addr().String()
}

// GRPCListenAddr 返回 gRPC 实际监听地址。
// Run 尚未执行时返回空字符串。并发安全。
func (s *Server) GRPCListenAddr() string {
	s.mu.Lock()
	ln := s.grpcLn
	s.mu.Unlock()
	if ln == nil {
		return ""
	}
	return ln.Addr().String()
}

// Run 启动 gRPC + HTTP 并阻塞，直到 ctx 取消（优雅关停）或某个服务出错。
// 执行流程：Listen → 注册 gRPC 服务 → 注册 HTTP 路由 → 并发 Serve → 等待退出信号。
//   - ctx: 上下文，取消时触发优雅关停
func (s *Server) Run(ctx context.Context) error {
	// 1. 监听端口（先 Listen 再 Serve，方便获取实际端口号）
	grpcLn, err := net.Listen("tcp", s.opts.GRPCAddr)
	if err != nil {
		return err
	}
	httpLn, err := net.Listen("tcp", s.opts.HTTPAddr)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.grpcLn = grpcLn
	s.httpLn = httpLn
	s.mu.Unlock()

	// 2. 创建 gRPC server，传入拦截器等选项。
	// 默认在最外层注入 Prometheus metrics 拦截器（service 标签取服务名），
	// 与各服务自带的 TraceID/Recover 链合并，使所有服务统一暴露 gRPC RED 指标。
	grpcOpts := append([]grpc.ServerOption{
		grpc.ChainUnaryInterceptor(grpcx.Metrics(s.name)),
	}, s.opts.GRPCOpts...)
	s.grpc = grpc.NewServer(grpcOpts...)
	healthpb.RegisterHealthServer(s.grpc, health.NewServer()) // 注册 gRPC 健康检查
	if s.opts.Register != nil {
		s.opts.Register(s.grpc) // 调用回调注册业务服务（如 UserServiceServer）
	}

	// 3. 创建 HTTP server，注册健康检查和 Prometheus 指标端点
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("ok"))
	})
	mux.Handle("/metrics", promhttp.Handler())
	if s.opts.HTTPRegister != nil {
		s.opts.HTTPRegister(mux)
	}
	s.http = &http.Server{Handler: mux}

	// 4. 并发启动两个服务
	errCh := make(chan error, 2)
	go func() { errCh <- s.grpc.Serve(s.grpcLn) }()
	go func() { errCh <- s.http.Serve(s.httpLn) }()

	// 5. 等待退出信号或服务出错
	select {
	case <-ctx.Done():
		// context 取消 → 优雅关停
		s.grpc.GracefulStop()
		_ = s.http.Shutdown(context.Background())
		return nil
	case e := <-errCh:
		// 某个服务出错 → 关停所有服务
		s.grpc.GracefulStop()
		_ = s.http.Shutdown(context.Background())
		if errors.Is(e, http.ErrServerClosed) || e == grpc.ErrServerStopped {
			return nil // 正常关闭不视为错误
		}
		return e
	}
}
