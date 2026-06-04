// Package main 启动 Order 服务。
// I2 阶段该服务仍为 mock 实现，当前先负责消费秒杀下单消息并发布订单创建事件，
// 为后续真实订单落库与 Payment 联调保留稳定的消息边界。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/yym108/gobao-pkg/cache"
	pkgcfg "github.com/yym108/gobao-pkg/config"
	"github.com/yym108/gobao-pkg/grpcx"
	"github.com/yym108/gobao-pkg/logger"
	"github.com/yym108/gobao-pkg/mq"
	"github.com/yym108/gobao-pkg/server"
	orderv1 "github.com/yym108/gobao-proto/gen/go/gobao/order/v1"
	"go.uber.org/zap"
	"google.golang.org/grpc"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	ordergrpc "github.com/yym108/gobao-order/internal/adapter/grpc"
	"github.com/yym108/gobao-order/internal/adapter/integration"
	mysqlrepo "github.com/yym108/gobao-order/internal/adapter/repository/mysql"
	"github.com/yym108/gobao-order/internal/application"
	"github.com/yym108/gobao-order/internal/config"
	"github.com/yym108/gobao-order/internal/domain"
	pkgerrors "github.com/yym108/gobao-pkg/errors"
)

// seckillOrderMessage 对应 Gateway 投递到 seckill.order 的基础消息体。
// Order mock 当前只消费这些字段，不引入真实订单表与状态流转。
type seckillOrderMessage struct {
	RequestID  string `json:"request_id"`  // 幂等请求 ID，用于追踪同一次抢购请求
	UserID     int64  `json:"user_id"`     // 发起抢购的用户 ID
	ActivityID int64  `json:"activity_id"` // 秒杀活动 ID
	ProductID  int64  `json:"product_id"`  // 关联商品 ID
	Quantity   int32  `json:"quantity"`    // 抢购数量
	QueuedAt   int64  `json:"queued_at"`   // Gateway 入队时间戳
}

// orderCreatedMessage 是 Order mock 发布给下游的占位事件。
// Payment mock 后续只要订阅该主题，就能在不依赖真实订单落库的前提下开始联调。
type orderCreatedMessage struct {
	OrderID    string `json:"order_id"`    // Mock 订单号，当前按 request_id 派生
	RequestID  string `json:"request_id"`  // 对应的幂等请求 ID
	UserID     int64  `json:"user_id"`     // 下单用户 ID
	ActivityID int64  `json:"activity_id"` // 秒杀活动 ID
	ProductID  int64  `json:"product_id"`  // 商品 ID
	Quantity   int32  `json:"quantity"`    // 下单数量
	Status     string `json:"status"`      // 当前固定为 CREATED，表示 mock 落单成功
	CreatedAt  int64  `json:"created_at"`  // Order mock 生成事件的时间戳
}

// paymentResultMessage 是 Payment 服务发布给 Order 的最小支付结果事件。
// 当前只依赖 order_id 与 status 推进普通订单状态，其他字段保留给日志与后续扩展使用。
type paymentResultMessage struct {
	PaymentID string `json:"payment_id"` // 支付单号
	OrderID   int64  `json:"order_id"`   // 订单 ID
	OrderNo   string `json:"order_no"`   // 订单号
	UserID    int64  `json:"user_id"`    // 用户 ID
	Amount    int64  `json:"amount"`     // 支付金额
	Status    string `json:"status"`     // 支付结果状态
	PaidAt    int64  `json:"paid_at"`    // 支付完成时间
}

// main 负责装配 Order 服务的运行依赖。
// 当前阶段除基础 HTTP/gRPC 健康检查外，还会建立 NATS 订阅来承接秒杀下单消息。
func main() {
	cfg := config.Config{
		HTTPAddr:              ":8080",
		GRPCAddr:              ":9090",
		LogLevel:              "info",
		MySQLDSN:              "root:root@tcp(mysql-order:3306)/order?charset=utf8mb4&parseTime=True&loc=Local",
		ProductGRPCAddr:       "product:9090",
		RedisAddr:             "redis:6379",
		RedisDB:               0,
		NATSURL:               "nats://localhost:4222",
		NATSStream:            "SECKILL",
		SeckillOrderSubject:   "seckill.order",
		SeckillOrderConsumer:  "order-mock",
		OrderCreatedSubject:   "order.created",
		OrderCancelledSubject: "order.cancelled",
		PaymentPaidSubject:    "payment.paid",
		PaymentFailedSubject:  "payment.failed",
	}
	if err := pkgcfg.Load("ORDER", "", &cfg); err != nil {
		panic("load order config: " + err.Error())
	}

	log := logger.New("order", cfg.LogLevel)
	defer func() { _ = log.Sync() }()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db := mustOpenMySQL(cfg, log)
	defer closeDB(db, log)

	rdb := mustOpenRedis(cfg, log)
	defer func() { _ = rdb.Close() }()

	productGW := mustOpenProductGateway(cfg, log)
	defer func() { _ = productGW.Close() }()

	orderRepo := mysqlrepo.NewOrderRepo(db)
	idemStore := integration.NewIdempotencyStore(rdb, "order:req:")
	bus := mustBuildBus(cfg, log)
	defer bus.Close()
	eventPublisher := integration.NewOrderEventPublisher(bus, cfg.OrderCreatedSubject, cfg.OrderCancelledSubject)
	orderUC := application.NewOrderUseCase(orderRepo, productGW, idemStore, eventPublisher)
	orderHandler := ordergrpc.NewOrderHandler(orderUC)
	subscribeSeckillOrders(ctx, bus, cfg, log)
	subscribePaymentResults(ctx, bus, cfg, log, orderUC)

	s := server.New("order", server.Options{
		HTTPAddr: cfg.HTTPAddr,
		GRPCAddr: cfg.GRPCAddr,
		GRPCOpts: []grpc.ServerOption{
			grpc.ChainUnaryInterceptor(grpcx.TraceID(), grpcx.Recover()),
		},
		Register: func(gs *grpc.Server) {
			orderv1.RegisterOrderServiceServer(gs, orderHandler)
		},
	})
	log.Info("starting service",
		zap.String("http_addr", cfg.HTTPAddr),
		zap.String("grpc_addr", cfg.GRPCAddr),
		zap.String("mysql_dsn", cfg.MySQLDSN),
		zap.String("product_grpc_addr", cfg.ProductGRPCAddr),
		zap.String("redis_addr", cfg.RedisAddr),
		zap.String("seckill_subject", cfg.SeckillOrderSubject),
		zap.String("order_created_subject", cfg.OrderCreatedSubject),
		zap.String("payment_paid_subject", cfg.PaymentPaidSubject),
		zap.String("payment_failed_subject", cfg.PaymentFailedSubject),
	)
	if err := s.Run(ctx); err != nil {
		log.Fatal("order service exited unexpectedly", zap.Error(err))
	}
}

// mustBuildBus 建立 Order mock 所需的 JetStream 总线。
// 这里一次性声明消费主题与后续发布主题，避免 Payment mock 接入时再回头改 Stream 边界。
func mustBuildBus(cfg config.Config, log *zap.Logger) *mq.Bus {
	bus, err := mq.New(mq.Config{
		URL:    cfg.NATSURL,
		Stream: cfg.NATSStream,
		Subjects: []string{
			cfg.SeckillOrderSubject,
			cfg.OrderCreatedSubject,
			cfg.OrderCancelledSubject,
			cfg.PaymentPaidSubject,
			cfg.PaymentFailedSubject,
		},
	})
	if err != nil {
		log.Fatal("failed to initialize order message bus", zap.Error(err))
	}
	return bus
}

type paymentStatusUpdater interface {
	// MarkOrderPaid 将订单状态从 CREATED 推进到 PAID。
	MarkOrderPaid(ctx context.Context, orderID int64) (*domain.Order, error)
	// MarkOrderPaymentFailed 将订单状态从 CREATED 推进到 PAYMENT_FAILED。
	MarkOrderPaymentFailed(ctx context.Context, orderID int64) (*domain.Order, error)
}

// mustOpenMySQL 建立订单服务所需的 MySQL 连接，并确保最小订单表结构存在。
func mustOpenMySQL(cfg config.Config, log *zap.Logger) *gorm.DB {
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
		log.Warn("order mysql not ready, retrying "+fmt.Sprintf("%d/30", i), zap.Error(err))
		time.Sleep(time.Second)
	}
	if err != nil {
		log.Fatal("failed to connect order mysql", zap.Error(err))
	}
	// 配置连接池：默认空闲连接仅 2，高并发下载频繁新建/销毁连接，显著拖慢写入吞吐。
	if sqlDB, poolErr := db.DB(); poolErr == nil {
		sqlDB.SetMaxOpenConns(50)
		sqlDB.SetMaxIdleConns(25)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
	}
	if err := db.AutoMigrate(&mysqlrepo.OrderModel{}, &mysqlrepo.OrderItemModel{}); err != nil {
		log.Fatal("failed to migrate order tables", zap.Error(err))
	}
	return db
}

// closeDB 关闭底层数据库连接，避免服务退出时遗留空闲连接。
func closeDB(db *gorm.DB, log *zap.Logger) {
	sqlDB, err := db.DB()
	if err != nil {
		log.Warn("failed to obtain order sql db", zap.Error(err))
		return
	}
	if err := sqlDB.Close(); err != nil {
		log.Warn("failed to close order sql db", zap.Error(err))
	}
}

// mustOpenRedis 建立订单服务幂等控制所需的 Redis 连接。
func mustOpenRedis(cfg config.Config, log *zap.Logger) *redis.Client {
	rdb, err := cache.NewClient(cache.Config{
		Addr: cfg.RedisAddr,
		DB:   cfg.RedisDB,
	})
	if err != nil {
		log.Fatal("failed to connect order redis", zap.Error(err))
	}
	return rdb
}

// mustOpenProductGateway 建立订单服务到 Product 服务的 gRPC 连接。
func mustOpenProductGateway(cfg config.Config, log *zap.Logger) *integration.ProductGateway {
	gateway, err := integration.NewProductGateway(cfg.ProductGRPCAddr)
	if err != nil {
		log.Fatal("failed to connect product grpc", zap.Error(err))
	}
	return gateway
}

// subscribeSeckillOrders 注册秒杀下单消费者。
// 当前 mock 行为是：解析消息 → 打印结构化日志 → 立即发布 order.created 占位事件。
func subscribeSeckillOrders(ctx context.Context, bus *mq.Bus, cfg config.Config, log *zap.Logger) {
	err := bus.Subscribe(ctx, cfg.SeckillOrderConsumer, cfg.SeckillOrderSubject, func(ctx context.Context, payload []byte) error {
		var msg seckillOrderMessage
		if err := json.Unmarshal(payload, &msg); err != nil {
			return err
		}

		log.Info("received seckill order message",
			zap.String("request_id", msg.RequestID),
			zap.Int64("user_id", msg.UserID),
			zap.Int64("activity_id", msg.ActivityID),
			zap.Int64("product_id", msg.ProductID),
			zap.Int32("quantity", msg.Quantity),
			zap.Int64("queued_at", msg.QueuedAt),
		)

		created := orderCreatedMessage{
			OrderID:    buildMockOrderID(msg),
			RequestID:  msg.RequestID,
			UserID:     msg.UserID,
			ActivityID: msg.ActivityID,
			ProductID:  msg.ProductID,
			Quantity:   msg.Quantity,
			Status:     "CREATED",
			CreatedAt:  time.Now().Unix(),
		}
		payload, err := json.Marshal(created)
		if err != nil {
			return err
		}
		if err := bus.Publish(ctx, cfg.OrderCreatedSubject, payload); err != nil {
			return err
		}

		log.Info("published mock order created message",
			zap.String("order_id", created.OrderID),
			zap.String("request_id", created.RequestID),
			zap.String("subject", cfg.OrderCreatedSubject),
		)
		return nil
	})
	if err != nil {
		log.Fatal("failed to subscribe seckill orders", zap.Error(err))
	}
}

// buildMockOrderID 为 I2 阶段生成稳定的 mock 订单号。
// 这里直接基于 request_id 派生，便于在未引入真实 ID 生成器前完成前后链路追踪。
func buildMockOrderID(msg seckillOrderMessage) string {
	return "mock-order-" + msg.RequestID
}

// subscribePaymentResults 注册支付结果消费者。
// 当前只处理普通订单主路径的支付事件，秒杀 mock 订单事件直接跳过并确认，
// 避免把演示链路的消息误推进到真实订单状态机中。
func subscribePaymentResults(ctx context.Context, bus *mq.Bus, cfg config.Config, log *zap.Logger, updater paymentStatusUpdater) {
	subscribe := func(consumer, subject string, apply func(context.Context, int64) (*domain.Order, error)) {
		err := bus.Subscribe(ctx, consumer, subject, func(ctx context.Context, payload []byte) error {
			var msg paymentResultMessage
			if err := json.Unmarshal(payload, &msg); err != nil {
				return err
			}
			if msg.OrderID <= 0 {
				log.Warn("skip payment result with invalid order id",
					zap.String("subject", subject),
					zap.Int64("order_id", msg.OrderID),
					zap.String("order_no", msg.OrderNo),
				)
				return nil
			}
			if strings.HasPrefix(msg.OrderNo, "mock-order-") {
				log.Info("skip mock seckill payment result",
					zap.String("subject", subject),
					zap.Int64("order_id", msg.OrderID),
					zap.String("order_no", msg.OrderNo),
				)
				return nil
			}

			order, err := apply(ctx, msg.OrderID)
			if err != nil {
				if pkgerrors.IsCode(err, pkgerrors.CodeNotFound) || pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
					log.Warn("skip non-retriable payment result",
						zap.String("subject", subject),
						zap.Int64("order_id", msg.OrderID),
						zap.String("order_no", msg.OrderNo),
						zap.Error(err),
					)
					return nil
				}
				return err
			}

			log.Info("applied payment result to order",
				zap.String("subject", subject),
				zap.Int64("order_id", msg.OrderID),
				zap.String("order_no", msg.OrderNo),
				zap.String("status", order.Status),
			)
			return nil
		})
		if err != nil {
			log.Fatal("failed to subscribe payment result events",
				zap.String("subject", subject),
				zap.Error(err),
			)
		}
	}

	subscribe("order-payment-paid", cfg.PaymentPaidSubject, updater.MarkOrderPaid)
	subscribe("order-payment-failed", cfg.PaymentFailedSubject, updater.MarkOrderPaymentFailed)
}
