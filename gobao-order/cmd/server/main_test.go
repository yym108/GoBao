package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/nats-io/nats-server/v2/server"
	"github.com/stretchr/testify/require"
	"github.com/yym108/gobao-order/internal/config"
	"github.com/yym108/gobao-order/internal/domain"
	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-pkg/mq"
	"go.uber.org/zap"
)

// TestSmoke 保留最基础的包级冒烟校验，确保测试入口可正常执行。
func TestSmoke(t *testing.T) {}

// TestMockConfigDefaults 约束 I2 阶段 Order mock 所需的默认配置值。
// 这样后续 main.go 接入 NATS 消费时，主题名与消费者名的约定不会被随意改坏。
func TestMockConfigDefaults(t *testing.T) {
	cfg := config.Config{
		HTTPAddr:              ":8080",
		GRPCAddr:              ":9090",
		LogLevel:              "info",
		MySQLDSN:              "root:root@tcp(localhost:3306)/order?charset=utf8mb4&parseTime=True&loc=Local",
		NATSURL:               "nats://localhost:4222",
		NATSStream:            "SECKILL",
		SeckillOrderSubject:   "seckill.order",
		SeckillOrderConsumer:  "order-mock",
		OrderCreatedSubject:   "order.created",
		OrderCancelledSubject: "order.cancelled",
		PaymentPaidSubject:    "payment.paid",
		PaymentFailedSubject:  "payment.failed",
	}

	if cfg.HTTPAddr == "" {
		t.Fatal("HTTPAddr must not be empty")
	}
	if cfg.GRPCAddr == "" {
		t.Fatal("GRPCAddr must not be empty")
	}
	if cfg.MySQLDSN == "" {
		t.Fatal("MySQLDSN must not be empty")
	}
	if cfg.NATSURL == "" {
		t.Fatal("NATSURL must not be empty")
	}
	if cfg.NATSStream != "SECKILL" {
		t.Fatalf("unexpected NATSStream: %q", cfg.NATSStream)
	}
	if cfg.SeckillOrderSubject != "seckill.order" {
		t.Fatalf("unexpected SeckillOrderSubject: %q", cfg.SeckillOrderSubject)
	}
	if cfg.SeckillOrderConsumer != "order-mock" {
		t.Fatalf("unexpected SeckillOrderConsumer: %q", cfg.SeckillOrderConsumer)
	}
	if cfg.OrderCreatedSubject != "order.created" {
		t.Fatalf("unexpected OrderCreatedSubject: %q", cfg.OrderCreatedSubject)
	}
	if cfg.OrderCancelledSubject != "order.cancelled" {
		t.Fatalf("unexpected OrderCancelledSubject: %q", cfg.OrderCancelledSubject)
	}
	if cfg.PaymentPaidSubject != "payment.paid" {
		t.Fatalf("unexpected PaymentPaidSubject: %q", cfg.PaymentPaidSubject)
	}
	if cfg.PaymentFailedSubject != "payment.failed" {
		t.Fatalf("unexpected PaymentFailedSubject: %q", cfg.PaymentFailedSubject)
	}
}

// TestSubscribePaymentResults_Paid 验证支付成功事件会驱动订单推进到 PAID。
func TestSubscribePaymentResults_Paid(t *testing.T) {
	url := runEmbeddedNATS(t)
	bus, err := mq.New(mq.Config{
		URL:      url,
		Stream:   "ORDER_PAYMENT_TEST",
		Subjects: []string{"payment.paid", "payment.failed"},
	})
	require.NoError(t, err)
	t.Cleanup(bus.Close)

	updatedCh := make(chan string, 1)
	subscribePaymentResults(context.Background(), bus, config.Config{
		PaymentPaidSubject:   "payment.paid",
		PaymentFailedSubject: "payment.failed",
	}, zap.NewNop(), &mockPaymentStatusUpdater{
		markPaidFn: func(_ context.Context, orderID int64) (*domain.Order, error) {
			if orderID != 901 {
				t.Fatalf("unexpected order id: %d", orderID)
			}
			order := &domain.Order{ID: orderID, OrderNo: "ORD-901", Status: domain.OrderStatusPaid}
			updatedCh <- order.Status
			return order, nil
		},
	})

	payload, err := json.Marshal(paymentResultMessage{
		PaymentID: "PAY-901",
		OrderID:   901,
		OrderNo:   "ORD-901",
		Status:    "SUCCEEDED",
	})
	require.NoError(t, err)
	require.NoError(t, bus.Publish(context.Background(), "payment.paid", payload))

	select {
	case status := <-updatedCh:
		require.Equal(t, domain.OrderStatusPaid, status)
	case <-time.After(2 * time.Second):
		t.Fatal("timeout waiting payment paid consumer")
	}
}

// TestSubscribePaymentResults_SkipMockOrder 验证秒杀 mock 订单号对应的支付结果会被直接跳过。
func TestSubscribePaymentResults_SkipMockOrder(t *testing.T) {
	url := runEmbeddedNATS(t)
	bus, err := mq.New(mq.Config{
		URL:      url,
		Stream:   "ORDER_PAYMENT_MOCK_SKIP_TEST",
		Subjects: []string{"payment.paid", "payment.failed"},
	})
	require.NoError(t, err)
	t.Cleanup(bus.Close)

	called := make(chan struct{}, 1)
	subscribePaymentResults(context.Background(), bus, config.Config{
		PaymentPaidSubject:   "payment.paid",
		PaymentFailedSubject: "payment.failed",
	}, zap.NewNop(), &mockPaymentStatusUpdater{
		markPaidFn: func(_ context.Context, _ int64) (*domain.Order, error) {
			called <- struct{}{}
			return &domain.Order{Status: domain.OrderStatusPaid}, nil
		},
	})

	payload, err := json.Marshal(paymentResultMessage{
		PaymentID: "PAY-MOCK",
		OrderID:   999001,
		OrderNo:   "mock-order-req-001",
		Status:    "SUCCEEDED",
	})
	require.NoError(t, err)
	require.NoError(t, bus.Publish(context.Background(), "payment.paid", payload))

	select {
	case <-called:
		t.Fatal("unexpected updater call for mock order")
	case <-time.After(300 * time.Millisecond):
	}
}

// TestSubscribePaymentResults_IgnoreFailedPrecondition 验证已终态订单导致的不可推进错误会被跳过确认。
func TestSubscribePaymentResults_IgnoreFailedPrecondition(t *testing.T) {
	url := runEmbeddedNATS(t)
	bus, err := mq.New(mq.Config{
		URL:      url,
		Stream:   "ORDER_PAYMENT_FAILED_TEST",
		Subjects: []string{"payment.paid", "payment.failed"},
	})
	require.NoError(t, err)
	t.Cleanup(bus.Close)

	subscribePaymentResults(context.Background(), bus, config.Config{
		PaymentPaidSubject:   "payment.paid",
		PaymentFailedSubject: "payment.failed",
	}, zap.NewNop(), &mockPaymentStatusUpdater{
		markFailedFn: func(_ context.Context, orderID int64) (*domain.Order, error) {
			if orderID != 902 {
				t.Fatalf("unexpected order id: %d", orderID)
			}
			return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "当前订单状态不可推进支付结果")
		},
	})

	payload, err := json.Marshal(paymentResultMessage{
		PaymentID: "PAY-902",
		OrderID:   902,
		OrderNo:   "ORD-902",
		Status:    "FAILED",
	})
	require.NoError(t, err)
	require.NoError(t, bus.Publish(context.Background(), "payment.failed", payload))

	time.Sleep(300 * time.Millisecond)
}

type mockPaymentStatusUpdater struct {
	markPaidFn   func(ctx context.Context, orderID int64) (*domain.Order, error)
	markFailedFn func(ctx context.Context, orderID int64) (*domain.Order, error)
}

func (m *mockPaymentStatusUpdater) MarkOrderPaid(ctx context.Context, orderID int64) (*domain.Order, error) {
	if m.markPaidFn == nil {
		return nil, nil
	}
	return m.markPaidFn(ctx, orderID)
}

func (m *mockPaymentStatusUpdater) MarkOrderPaymentFailed(ctx context.Context, orderID int64) (*domain.Order, error) {
	if m.markFailedFn == nil {
		return nil, nil
	}
	return m.markFailedFn(ctx, orderID)
}

func runEmbeddedNATS(t *testing.T) string {
	t.Helper()
	opts := &server.Options{
		Port:      -1,
		JetStream: true,
		StoreDir:  t.TempDir(),
	}
	s, err := server.NewServer(opts)
	require.NoError(t, err)
	go s.Start()
	require.True(t, s.ReadyForConnections(2*time.Second))
	t.Cleanup(s.Shutdown)
	return s.ClientURL()
}
