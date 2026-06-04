// Product 服务启动入口。
// 负责加载配置、连接 MySQL、装配依赖并启动 HTTP/gRPC 服务。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"github.com/yym108/gobao-pkg/cache"
	pkgcfg "github.com/yym108/gobao-pkg/config"
	"github.com/yym108/gobao-pkg/grpcx"
	"github.com/yym108/gobao-pkg/logger"
	"github.com/yym108/gobao-pkg/server"
	productv1 "github.com/yym108/gobao-proto/gen/go/gobao/product/v1"

	productgrpc "github.com/yym108/gobao-product/internal/adapter/grpc"
	mysqlrepo "github.com/yym108/gobao-product/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-product/internal/adapter/repository/redisrepo"
	localstore "github.com/yym108/gobao-product/internal/adapter/storage/local"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/config"
)

// redisSeckillStore 适配 go-redis 客户端到秒杀预热所需的最小写入接口。
type redisSeckillStore struct {
	client *redis.Client // Redis 客户端
}

// Set 将秒杀活动元信息或库存写入 Redis，并附带过期时间。
//   - ctx: 上下文
//   - key: Redis 键名
//   - value: 要写入的值
//   - ttl: 过期时间
func (s *redisSeckillStore) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	switch v := value.(type) {
	case string, []byte, int, int32, int64, uint, uint32, uint64, float32, float64, bool:
		return s.client.Set(ctx, key, v, ttl).Err()
	default:
		// 秒杀活动元信息使用 JSON 落盘，便于 Gateway 后续统一读取和调试。
		payload, err := json.Marshal(v)
		if err != nil {
			return err
		}
		return s.client.Set(ctx, key, payload, ttl).Err()
	}
}

func main() {
	// 1. 加载配置：默认值适用于 Docker Compose 环境，环境变量 PRODUCT_* 覆盖
	cfg := config.Config{
		HTTPAddr:     ":8080",
		GRPCAddr:     ":9090",
		LogLevel:     "info",
		MySQLDSN:     "root:root@tcp(mysql-product:3306)/product?charset=utf8mb4&parseTime=True&loc=Local",
		RedisAddr:    "redis:6379",
		RedisDB:      0,
		MediaRoot:    "/data/gobao/product-media",
		MediaBaseURL: "/media",
	}
	if err := pkgcfg.Load("PRODUCT", "", &cfg); err != nil {
		panic("load product config: " + err.Error())
	}

	// 2. 初始化日志
	log := logger.New("product", cfg.LogLevel)
	defer func() { _ = log.Sync() }()

	// 3. 连接 MySQL（带重试，等待 MySQL 就绪后再继续）
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
	// 配置连接池：默认空闲连接仅 2，高并发查商品/扣库存时连接复用不足会拖慢吞吐。
	if sqlDB, poolErr := db.DB(); poolErr == nil {
		sqlDB.SetMaxOpenConns(50)
		sqlDB.SetMaxIdleConns(25)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
	}
	rdb, err := cache.NewClient(cache.Config{
		Addr: cfg.RedisAddr,
		DB:   cfg.RedisDB,
	})
	if err != nil {
		log.Fatal("redis connect failed: " + err.Error())
	}
	defer func() { _ = rdb.Close() }()

	// 4. 依赖装配链：Repo → UseCase → gRPC Handler
	catRepo := mysqlrepo.NewCategoryRepo(db)
	prodRepo := mysqlrepo.NewProductRepo(db)
	groupRepo := mysqlrepo.NewProductGroupRepo(db)
	// 库存以 Redis 为权威:下单热路径走 Lua 原子扣减,消除单热点商品的 MySQL 行锁瓶颈;
	// MySQL 仓储退化为种子/备份与后台展示来源。
	mysqlStockRepo := mysqlrepo.NewStockRepo(db)
	stockRepo := redisrepo.NewStockStore(rdb, mysqlStockRepo)
	seckillRepo := mysqlrepo.NewSeckillActivityRepo(db)
	mediaRepo := mysqlrepo.NewMediaRepo(db)
	groupMediaRepo := mysqlrepo.NewProductGroupMediaRepo(db)
	productMediaRepo := mysqlrepo.NewProductMediaRepo(db)
	mediaStore := localstore.NewMediaStore(cfg.MediaRoot, cfg.MediaBaseURL)

	catUC := application.NewCategoryUseCase(catRepo, groupRepo)
	groupUC := application.NewProductGroupUseCase(groupRepo, catRepo)
	prodUC := application.NewProductUseCase(prodRepo, groupRepo, catRepo, stockRepo).AttachMediaRepos(groupMediaRepo, productMediaRepo)
	stockUC := application.NewStockUseCase(prodRepo, stockRepo)
	seckillUC := application.NewSeckillUseCase(prodRepo, seckillRepo, &redisSeckillStore{client: rdb})
	mediaAdminUC := application.NewMediaAdminUseCase(mediaRepo, groupMediaRepo, productMediaRepo, groupRepo, prodRepo, mediaStore)

	handler := productgrpc.NewProductHandler(prodUC, groupUC, catUC, stockUC, seckillUC).AttachMediaAdmin(mediaAdminUC)

	// 5. 注册信号监听，SIGINT/SIGTERM 触发优雅关停
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// 启动库存回写同步器:定时把 Redis 权威库存刷回 MySQL 备份,
	// 把"Redis 丢数据后用旧值预热导致库存回退"的误差收敛到一个同步周期以内。
	stockSyncer := redisrepo.NewStockSyncer(rdb, mysqlStockRepo, time.Minute).
		WithResultHook(func(synced int, err error) {
			if err != nil {
				log.Error("stock sync to mysql failed", zap.Error(err))
				return
			}
			log.Info("stock sync to mysql done", zap.Int("synced", synced))
		})
	go stockSyncer.Run(ctx)

	// 6. 创建并启动 gRPC + HTTP 双协议服务
	s := server.New("product", server.Options{
		HTTPAddr: cfg.HTTPAddr,
		GRPCAddr: cfg.GRPCAddr,
		GRPCOpts: []grpc.ServerOption{
			// 拦截器链：TraceID 透传 → Recover 捕获 panic
			grpc.ChainUnaryInterceptor(grpcx.TraceID(), grpcx.Recover()),
		},
		Register: func(gs *grpc.Server) {
			// 注册 Product gRPC 服务
			productv1.RegisterProductServiceServer(gs, handler)
		},
		HTTPRegister: func(mux *http.ServeMux) {
			productgrpc.RegisterMediaHTTP(mux, cfg.MediaBaseURL, cfg.MediaRoot)
		},
	})

	log.Info("starting product service")
	if err := s.Run(ctx); err != nil {
		log.Fatal(err.Error())
	}
}
