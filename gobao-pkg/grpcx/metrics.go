// Package grpcx 的本文件提供 gRPC 服务端的 Prometheus 监控拦截器。
// 统一暴露 RED 指标（Rate 请求量 / Errors 错误 / Duration 耗时），
// 供各服务通过 /metrics 端点被 Prometheus 抓取，用于压测与日常可观测。
package grpcx

import (
	"context"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/status"
)

// grpcRequestsTotal 记录 gRPC 服务端按服务、方法、状态码累计处理的请求数。
// service 区分来源服务（user/product/order…），method 为 gRPC 全限定方法名，
// code 为响应的 gRPC 状态码字符串（OK、Aborted、Internal…）。
var grpcRequestsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "grpc_server_handled_total",
	Help: "gRPC 服务端按方法与状态码累计处理的请求数。",
}, []string{"service", "method", "code"})

// grpcRequestDuration 记录 gRPC 服务端方法处理耗时分布（秒）。
// 使用 Prometheus 默认分桶，便于直接用 histogram_quantile 估算 P95/P99。
var grpcRequestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
	Name:    "grpc_server_handling_seconds",
	Help:    "gRPC 服务端方法处理耗时分布（秒）。",
	Buckets: prometheus.DefBuckets,
}, []string{"service", "method"})

// Metrics 返回一个 gRPC 一元拦截器，记录每次调用的请求量、状态码与耗时。
// 应作为拦截器链的最外层，以便准确捕获内层拦截器（如 Recover）最终返回的状态码。
//   - service: 当前服务名，作为指标 service 标签，用于在 Prometheus 中区分来源
func Metrics(service string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := h(ctx, req)
		code := status.Code(err).String()
		grpcRequestsTotal.WithLabelValues(service, info.FullMethod, code).Inc()
		grpcRequestDuration.WithLabelValues(service, info.FullMethod).Observe(time.Since(start).Seconds())
		return resp, err
	}
}
