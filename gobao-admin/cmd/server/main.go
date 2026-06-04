package main

import (
	"context"
	"fmt"
	"os/signal"
	"syscall"
	"time"

	"google.golang.org/grpc"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	admingrpc "github.com/yym108/gobao-admin/internal/adapter/grpc"
	mysqlrepo "github.com/yym108/gobao-admin/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-admin/internal/application"
	"github.com/yym108/gobao-admin/internal/config"
	"github.com/yym108/gobao-pkg/authn"
	pkgcfg "github.com/yym108/gobao-pkg/config"
	"github.com/yym108/gobao-pkg/grpcx"
	"github.com/yym108/gobao-pkg/logger"
	"github.com/yym108/gobao-pkg/server"
	adminv1 "github.com/yym108/gobao-proto/gen/go/gobao/admin/v1"
)

func main() {
	// 1. 加载配置：默认值适用于 Docker Compose 环境，环境变量 ADMIN_* 覆盖
	cfg := config.Config{
		HTTPAddr:  ":8080",
		GRPCAddr:  ":9090",
		LogLevel:  "info",
		MySQLDSN:  "root:root@tcp(mysql-admin:3306)/admin?charset=utf8mb4&parseTime=True&loc=Local",
		JWTSecret: "gobao-dev-secret-change-in-prod",
		JWTExpiry: "24h",
	}
	if err := pkgcfg.Load("ADMIN", "", &cfg); err != nil {
		panic("load admin config: " + err.Error())
	}

	// 2. 初始化日志
	log := logger.New("admin", cfg.LogLevel)
	defer func() { _ = log.Sync() }()

	// 3. 连接 MySQL（带重试，等待 mysql-admin 就绪）
	var (
		db  *gorm.DB
		err error
	)
	for i := 1; i <= 30; i++ {
		db, err = gorm.Open(mysql.Open(cfg.MySQLDSN), &gorm.Config{})
		if err == nil {
			sqlDB, pingErr := db.DB()
			if pingErr == nil {
				pingErr = sqlDB.Ping()
			}
			if pingErr == nil {
				break
			}
			err = pingErr
		}
		log.Warn("mysql not ready, retrying " + fmt.Sprintf("%d/30", i) + ": " + err.Error())
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatal("mysql connect failed after 30 retries: " + err.Error())
	}
	if err := db.AutoMigrate(&mysqlrepo.AdminModel{}); err != nil {
		log.Fatal("auto migrate failed: " + err.Error())
	}

	// 4. 初始化领域依赖链：Repo -> JWT -> UseCase -> gRPC Handler
	jwtExpiry, err := time.ParseDuration(cfg.JWTExpiry)
	if err != nil {
		jwtExpiry = 24 * time.Hour
	}
	repo := mysqlrepo.NewAdminRepo(db)
	jwtMgr := authn.NewJWTManager(cfg.JWTSecret, jwtExpiry)
	uc := application.NewAdminUseCase(repo, jwtMgr)
	handler := admingrpc.NewAdminHandler(uc)

	// 5. 注册信号监听，SIGINT/SIGTERM 触发优雅关停
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 6. 启动 gRPC + HTTP 双协议服务
	s := server.New("admin", server.Options{
		HTTPAddr: cfg.HTTPAddr,
		GRPCAddr: cfg.GRPCAddr,
		GRPCOpts: []grpc.ServerOption{
			grpc.ChainUnaryInterceptor(grpcx.TraceID(), grpcx.Recover()),
		},
		Register: func(gs *grpc.Server) {
			adminv1.RegisterAdminServiceServer(gs, handler)
		},
	})

	log.Info("starting admin service")
	if err := s.Run(ctx); err != nil {
		log.Fatal(err.Error())
	}
}
