package application_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/yym108/gobao-order/internal/application"
	"github.com/yym108/gobao-order/internal/domain"
	pkgerrors "github.com/yym108/gobao-pkg/errors"
)

// TestOrderUseCase_CreateOrder_Success 验证订单应用层会基于独立商品快照创建订单。
func TestOrderUseCase_CreateOrder_Success(t *testing.T) {
	orderRepo := &mockOrderRepo{
		createFn: func(_ context.Context, order *domain.Order) error {
			order.ID = 101
			now := time.Date(2026, 5, 18, 12, 0, 0, 0, time.UTC)
			order.CreatedAt = now
			order.UpdatedAt = now
			for idx := range order.Items {
				order.Items[idx].ID = int64(idx + 1)
				order.Items[idx].OrderID = order.ID
			}
			return nil
		},
	}
	productGateway := &mockProductGateway{
		getProductByIDFn: func(_ context.Context, productID int64) (*application.ProductView, error) {
			if productID != 1001002 {
				t.Fatalf("unexpected productID: %d", productID)
			}
			return &application.ProductView{
				ProductID:     1001002,
				ProductName:   "MacBook Air",
				ImageURL:      "https://example.com/macbook-air.png",
				SpecLabel:     "M4 / 16GB / 512GB",
				Price:         999900,
				StockQuantity: 8,
				Status:        1,
			}, nil
		},
		deductStockFn: func(_ context.Context, productID int64, quantity int32) error {
			if productID != 1001002 || quantity != 2 {
				t.Fatalf("unexpected deduct args: product=%d quantity=%d", productID, quantity)
			}
			return nil
		},
	}
	idemStore := &mockIdempotencyStore{
		acquireFn: func(_ context.Context, key string, ttl time.Duration) (bool, error) {
			if key != "1001:req-001" {
				t.Fatalf("unexpected idempotency key: %q", key)
			}
			if ttl <= 0 {
				t.Fatalf("unexpected ttl: %v", ttl)
			}
			return true, nil
		},
	}
	publisher := &mockOrderEventPublisher{
		publishCreatedFn: func(_ context.Context, order *domain.Order) error {
			if order == nil || order.ID != 101 {
				t.Fatalf("unexpected created event order: %+v", order)
			}
			return nil
		},
	}

	uc := application.NewOrderUseCase(orderRepo, productGateway, idemStore, publisher)
	order, err := uc.CreateOrder(context.Background(), application.CreateOrderCommand{
		UserID:        1001,
		RequestID:     "req-001",
		ProductID:     1001002,
		Quantity:      2,
		ReceiverName:  "张三",
		ReceiverPhone: "13800138000",
		Province:      "上海市",
		City:          "上海市",
		District:      "浦东新区",
		AddressLine:   "世纪大道 100 号 18 层",
		PostalCode:    "200120",
	})
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	if order == nil {
		t.Fatal("expect order created")
	}
	if order.OrderNo == "" {
		t.Fatal("expect order no generated")
	}
	if order.TotalAmount != 1999800 {
		t.Fatalf("total amount want 1999800, got %d", order.TotalAmount)
	}
	if len(order.Items) != 1 {
		t.Fatalf("items len want 1, got %d", len(order.Items))
	}
	if order.Items[0].ProductID != 1001002 || order.Items[0].OptionSummary != "M4 / 16GB / 512GB" {
		t.Fatalf("unexpected product snapshot: %+v", order.Items[0])
	}
	if order.ReceiverName != "张三" || order.AddressLine != "世纪大道 100 号 18 层" {
		t.Fatalf("unexpected address snapshot: receiver=%q address=%q", order.ReceiverName, order.AddressLine)
	}
}

// TestOrderUseCase_CreateOrder_DuplicateRequest 验证重复 request_id 不会生成第二张订单。
func TestOrderUseCase_CreateOrder_DuplicateRequest(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{},
		&mockProductGateway{},
		&mockIdempotencyStore{
			acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) {
				return false, nil
			},
		},
		&mockOrderEventPublisher{},
	)
	_, err := uc.CreateOrder(context.Background(), application.CreateOrderCommand{
		UserID:    1001,
		RequestID: "req-dup",
		ProductID: 1001002,
		Quantity:  1,
	})
	if !pkgerrors.IsCode(err, pkgerrors.CodeConflict) {
		t.Fatalf("expect CodeConflict, got %v", err)
	}
}

// TestOrderUseCase_CreateOrder_ProductNotFound 验证后端找不到 product_id 时直接返回未找到。
func TestOrderUseCase_CreateOrder_ProductNotFound(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{},
		&mockProductGateway{
			getProductByIDFn: func(_ context.Context, productID int64) (*application.ProductView, error) {
				return nil, nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	_, err := uc.CreateOrder(context.Background(), application.CreateOrderCommand{
		UserID:    1001,
		RequestID: "req-missing",
		ProductID: 9999999,
		Quantity:  1,
	})
	if !pkgerrors.IsCode(err, pkgerrors.CodeNotFound) {
		t.Fatalf("expect CodeNotFound, got %v", err)
	}
}

// TestOrderUseCase_CreateOrder_InsufficientStock 验证库存不足由 Product 协作层向上透传为前置条件失败。
func TestOrderUseCase_CreateOrder_InsufficientStock(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{},
		&mockProductGateway{
			getProductByIDFn: func(_ context.Context, productID int64) (*application.ProductView, error) {
				return &application.ProductView{
					ProductID:     productID,
					ProductName:   "MacBook Air",
					ImageURL:      "https://example.com/macbook-air.png",
					SpecLabel:     "M4 / 16GB / 512GB",
					Price:         999900,
					StockQuantity: 0,
					Status:        1,
				}, nil
			},
			deductStockFn: func(_ context.Context, _ int64, _ int32) error {
				return pkgerrors.New(pkgerrors.CodeFailedPrecondition, "库存不足")
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	_, err := uc.CreateOrder(context.Background(), application.CreateOrderCommand{
		UserID:    1001,
		RequestID: "req-stock",
		ProductID: 1001002,
		Quantity:  1,
	})
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

// TestOrderUseCase_CreateOrder_PublishEventFailed 验证订单已落库后若事件发布失败，会向上返回错误。
func TestOrderUseCase_CreateOrder_PublishEventFailed(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			createFn: func(_ context.Context, order *domain.Order) error {
				order.ID = 401
				return nil
			},
		},
		&mockProductGateway{
			getProductByIDFn: func(_ context.Context, productID int64) (*application.ProductView, error) {
				return &application.ProductView{
					ProductID:     productID,
					ProductName:   "MacBook Air",
					ImageURL:      "https://example.com/macbook-air.png",
					SpecLabel:     "M4 / 16GB / 512GB",
					Price:         999900,
					StockQuantity: 8,
					Status:        1,
				}, nil
			},
			deductStockFn: func(_ context.Context, _ int64, _ int32) error { return nil },
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{
			publishCreatedFn: func(_ context.Context, order *domain.Order) error {
				if order == nil || order.ID != 401 {
					t.Fatalf("unexpected order on publish failure: %+v", order)
				}
				return errors.New("publish failed")
			},
		},
	)

	_, err := uc.CreateOrder(context.Background(), application.CreateOrderCommand{
		UserID:    1001,
		RequestID: "req-publish-fail",
		ProductID: 1001002,
		Quantity:  1,
	})
	if err == nil || err.Error() != "publish failed" {
		t.Fatalf("expect publish failed error, got %v", err)
	}
}

type mockOrderRepo struct {
	createFn       func(ctx context.Context, order *domain.Order) error
	findByIDFn     func(ctx context.Context, id int64) (*domain.Order, error)
	listByUserIDFn func(ctx context.Context, userID int64, page, pageSize int) ([]*domain.Order, int64, error)
	listAllFn      func(ctx context.Context, status string, userID int64, page, pageSize int) ([]*domain.Order, int64, error)
	updateStatusFn func(ctx context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, closeReason string, closedAt *time.Time) (bool, error)
}

func (m *mockOrderRepo) Create(ctx context.Context, order *domain.Order) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, order)
}

func (m *mockOrderRepo) FindByID(ctx context.Context, id int64) (*domain.Order, error) {
	if m.findByIDFn == nil {
		return nil, nil
	}
	return m.findByIDFn(ctx, id)
}

func (m *mockOrderRepo) ListByUserID(ctx context.Context, userID int64, page, pageSize int) ([]*domain.Order, int64, error) {
	if m.listByUserIDFn == nil {
		return nil, 0, nil
	}
	return m.listByUserIDFn(ctx, userID, page, pageSize)
}

func (m *mockOrderRepo) ListAll(ctx context.Context, status string, userID int64, page, pageSize int) ([]*domain.Order, int64, error) {
	if m.listAllFn == nil {
		return nil, 0, nil
	}
	return m.listAllFn(ctx, status, userID, page, pageSize)
}

func (m *mockOrderRepo) UpdateStatus(ctx context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, closeReason string, closedAt *time.Time) (bool, error) {
	if m.updateStatusFn == nil {
		return false, nil
	}
	return m.updateStatusFn(ctx, id, fromStatus, toStatus, updatedAt, closeReason, closedAt)
}

type mockProductGateway struct {
	getProductByIDFn func(ctx context.Context, productID int64) (*application.ProductView, error)
	deductStockFn    func(ctx context.Context, productID int64, quantity int32) error
	restoreStockFn   func(ctx context.Context, productID int64, quantity int32) error
}

func (m *mockProductGateway) GetProductByID(ctx context.Context, productID int64) (*application.ProductView, error) {
	if m.getProductByIDFn == nil {
		return nil, nil
	}
	return m.getProductByIDFn(ctx, productID)
}

func (m *mockProductGateway) DeductStock(ctx context.Context, productID int64, quantity int32) error {
	if m.deductStockFn == nil {
		return nil
	}
	return m.deductStockFn(ctx, productID, quantity)
}

func (m *mockProductGateway) RestoreStock(ctx context.Context, productID int64, quantity int32) error {
	if m.restoreStockFn == nil {
		return nil
	}
	return m.restoreStockFn(ctx, productID, quantity)
}

type mockIdempotencyStore struct {
	acquireFn func(ctx context.Context, key string, ttl time.Duration) (bool, error)
}

func (m *mockIdempotencyStore) Acquire(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	if m.acquireFn == nil {
		return false, errors.New("acquireFn not set")
	}
	return m.acquireFn(ctx, key, ttl)
}

type mockOrderEventPublisher struct {
	publishCreatedFn   func(ctx context.Context, order *domain.Order) error
	publishCancelledFn func(ctx context.Context, order *domain.Order) error
}

func (m *mockOrderEventPublisher) PublishOrderCreated(ctx context.Context, order *domain.Order) error {
	if m.publishCreatedFn == nil {
		return nil
	}
	return m.publishCreatedFn(ctx, order)
}

func (m *mockOrderEventPublisher) PublishOrderCancelled(ctx context.Context, order *domain.Order) error {
	if m.publishCancelledFn == nil {
		return nil
	}
	return m.publishCancelledFn(ctx, order)
}

// TestOrderUseCase_MarkOrderPaid_Success 验证支付成功事件可以把订单从 CREATED 推进到 PAID。
func TestOrderUseCase_MarkOrderPaid_Success(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, UserID: 1001, Status: domain.OrderStatusCreated}, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, _ string, _ *time.Time) (bool, error) {
				if id != 501 || fromStatus != domain.OrderStatusCreated || toStatus != domain.OrderStatusPaid {
					t.Fatalf("unexpected update args id=%d from=%s to=%s", id, fromStatus, toStatus)
				}
				if updatedAt.IsZero() {
					t.Fatal("expect updatedAt assigned")
				}
				return true, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)

	order, err := uc.MarkOrderPaid(context.Background(), 501)
	if err != nil {
		t.Fatalf("mark order paid: %v", err)
	}
	if order == nil || order.Status != domain.OrderStatusPaid {
		t.Fatalf("unexpected paid order: %+v", order)
	}
}

// TestOrderUseCase_MarkOrderPaymentFailed_Success 验证支付失败事件会把订单从 CREATED 推进到 CANCELLED，并回补库存。
func TestOrderUseCase_MarkOrderPaymentFailed_Success(t *testing.T) {
	restoreCalls := 0
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{
					ID:     id,
					UserID: 1001,
					Status: domain.OrderStatusCreated,
					Items: []domain.OrderItem{
						{ProductID: 1001002, Quantity: 2},
					},
				}, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, _ string, _ *time.Time) (bool, error) {
				if id != 502 || fromStatus != domain.OrderStatusCreated || toStatus != domain.OrderStatusCancelled {
					t.Fatalf("unexpected update args id=%d from=%s to=%s", id, fromStatus, toStatus)
				}
				if updatedAt.IsZero() {
					t.Fatal("expect updatedAt assigned")
				}
				return true, nil
			},
		},
		&mockProductGateway{
			restoreStockFn: func(_ context.Context, productID int64, quantity int32) error {
				restoreCalls++
				if productID != 1001002 || quantity != 2 {
					t.Fatalf("unexpected restore args skuID=%d quantity=%d", productID, quantity)
				}
				return nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)

	order, err := uc.MarkOrderPaymentFailed(context.Background(), 502)
	if err != nil {
		t.Fatalf("mark order payment failed: %v", err)
	}
	if restoreCalls != 1 {
		t.Fatalf("expected restore stock once, got %d", restoreCalls)
	}
	if order == nil || order.Status != domain.OrderStatusCancelled {
		t.Fatalf("unexpected failed order: %+v", order)
	}
}

// TestOrderUseCase_MarkOrderPaid_FailedPrecondition 验证非 CREATED 订单不会被重复推进到已支付。
func TestOrderUseCase_MarkOrderPaid_FailedPrecondition(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, UserID: 1001, Status: domain.OrderStatusCancelled}, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)

	_, err := uc.MarkOrderPaid(context.Background(), 503)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

// TestOrderUseCase_MarkOrderPaid_ExpiredOrder 验证已过期订单不会再被推进为已支付。
func TestOrderUseCase_MarkOrderPaid_ExpiredOrder(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{
					ID:       id,
					UserID:   1001,
					Status:   domain.OrderStatusCreated,
					ExpireAt: now.Add(-time.Second),
					Items:    []domain.OrderItem{{ProductID: 1003001, Quantity: 1}},
				}, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, _ time.Time, closeReason string, closedAt *time.Time) (bool, error) {
				if id != 504 || fromStatus != domain.OrderStatusCreated || toStatus != domain.OrderStatusCancelled {
					t.Fatalf("unexpected update args id=%d from=%s to=%s", id, fromStatus, toStatus)
				}
				if closeReason != domain.OrderCloseReasonTimeout {
					t.Fatalf("unexpected close reason: %s", closeReason)
				}
				if closedAt == nil || closedAt.IsZero() {
					t.Fatal("expect closedAt assigned")
				}
				return true, nil
			},
		},
		&mockProductGateway{
			restoreStockFn: func(_ context.Context, productID int64, quantity int32) error {
				if productID != 1003001 || quantity != 1 {
					t.Fatalf("unexpected restore args sku=%d quantity=%d", productID, quantity)
				}
				return nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	uc.SetTimeNowFuncForTest(func() time.Time { return now })

	_, err := uc.MarkOrderPaid(context.Background(), 504)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

// TestOrderUseCase_GetOrderByID_Success 验证应用层可以按订单 ID 查询订单聚合。
func TestOrderUseCase_GetOrderByID_Success(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, OrderNo: "ORD-GET-001", UserID: 1001}, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	order, err := uc.GetOrderByID(context.Background(), 1001, 101)
	if err != nil {
		t.Fatalf("get order by id: %v", err)
	}
	if order == nil || order.OrderNo != "ORD-GET-001" {
		t.Fatalf("unexpected order: %+v", order)
	}
}

// TestOrderUseCase_GetOrderByID_AutoCancelExpired 验证查询超时未支付订单时会自动关闭并回补库存。
func TestOrderUseCase_GetOrderByID_AutoCancelExpired(t *testing.T) {
	restoreCalls := 0
	cancelledPublished := false
	now := time.Date(2026, 5, 29, 10, 0, 0, 0, time.UTC)
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{
					ID:        id,
					OrderNo:   "ORD-EXPIRED-001",
					UserID:    1001,
					Status:    domain.OrderStatusCreated,
					ExpireAt:  now.Add(-time.Minute),
					CreatedAt: now.Add(-16 * time.Minute),
					UpdatedAt: now.Add(-16 * time.Minute),
					Items:     []domain.OrderItem{{ProductID: 1001002, Quantity: 1}},
				}, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, closeReason string, closedAt *time.Time) (bool, error) {
				if id != 601 || fromStatus != domain.OrderStatusCreated || toStatus != domain.OrderStatusCancelled {
					t.Fatalf("unexpected update args id=%d from=%s to=%s", id, fromStatus, toStatus)
				}
				if closeReason != domain.OrderCloseReasonTimeout {
					t.Fatalf("unexpected close reason: %s", closeReason)
				}
				if closedAt == nil || closedAt.IsZero() {
					t.Fatal("expect closedAt assigned")
				}
				if !updatedAt.Equal(now) {
					t.Fatalf("unexpected updatedAt: %v", updatedAt)
				}
				return true, nil
			},
		},
		&mockProductGateway{
			restoreStockFn: func(_ context.Context, productID int64, quantity int32) error {
				restoreCalls++
				if productID != 1001002 || quantity != 1 {
					t.Fatalf("unexpected restore args sku=%d quantity=%d", productID, quantity)
				}
				return nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{
			publishCancelledFn: func(_ context.Context, order *domain.Order) error {
				cancelledPublished = true
				if order == nil || order.CloseReason != domain.OrderCloseReasonTimeout {
					t.Fatalf("unexpected cancelled event order: %+v", order)
				}
				return nil
			},
		},
	)
	uc.SetTimeNowFuncForTest(func() time.Time { return now })

	order, err := uc.GetOrderByID(context.Background(), 1001, 601)
	if err != nil {
		t.Fatalf("get order by id: %v", err)
	}
	if restoreCalls != 1 {
		t.Fatalf("expected restore once, got %d", restoreCalls)
	}
	if !cancelledPublished {
		t.Fatal("expected cancelled event published")
	}
	if order == nil || order.Status != domain.OrderStatusCancelled {
		t.Fatalf("unexpected order: %+v", order)
	}
	if order.CloseReason != domain.OrderCloseReasonTimeout {
		t.Fatalf("unexpected close reason: %s", order.CloseReason)
	}
}

// TestOrderUseCase_GetOrderByID_Forbidden 验证用户不能读取他人的订单。
func TestOrderUseCase_GetOrderByID_Forbidden(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, OrderNo: "ORD-GET-002", UserID: 2002}, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	_, err := uc.GetOrderByID(context.Background(), 1001, 102)
	if !pkgerrors.IsCode(err, pkgerrors.CodeForbidden) {
		t.Fatalf("expect CodeForbidden, got %v", err)
	}
}

// TestOrderUseCase_ListOrdersByUserID_Success 验证应用层可按用户分页列单。
func TestOrderUseCase_ListOrdersByUserID_Success(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			listByUserIDFn: func(_ context.Context, userID int64, page, pageSize int) ([]*domain.Order, int64, error) {
				if userID != 1001 || page != 1 || pageSize != 2 {
					t.Fatalf("unexpected args user=%d page=%d pageSize=%d", userID, page, pageSize)
				}
				return []*domain.Order{
					{ID: 201, OrderNo: "ORD-LIST-003", UserID: 1001},
					{ID: 202, OrderNo: "ORD-LIST-002", UserID: 1001},
				}, 3, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	items, total, err := uc.ListOrdersByUserID(context.Background(), 1001, 1, 2)
	if err != nil {
		t.Fatalf("list orders: %v", err)
	}
	if total != 3 || len(items) != 2 {
		t.Fatalf("unexpected list result total=%d len=%d", total, len(items))
	}
}

// TestOrderUseCase_ListOrdersByUserID_AutoCancelExpired 验证列表查询也会自动收敛已过期的待支付订单。
func TestOrderUseCase_ListOrdersByUserID_AutoCancelExpired(t *testing.T) {
	now := time.Date(2026, 5, 29, 11, 0, 0, 0, time.UTC)
	updateCalls := 0
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			listByUserIDFn: func(_ context.Context, userID int64, page, pageSize int) ([]*domain.Order, int64, error) {
				return []*domain.Order{
					{
						ID:       701,
						OrderNo:  "ORD-LIST-EXPIRED",
						UserID:   userID,
						Status:   domain.OrderStatusCreated,
						ExpireAt: now.Add(-2 * time.Minute),
						Items:    []domain.OrderItem{{ProductID: 1002001, Quantity: 2}},
					},
					{
						ID:       702,
						OrderNo:  "ORD-LIST-PAID",
						UserID:   userID,
						Status:   domain.OrderStatusPaid,
						ExpireAt: now.Add(-2 * time.Minute),
					},
				}, 2, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, closeReason string, closedAt *time.Time) (bool, error) {
				updateCalls++
				if id != 701 {
					t.Fatalf("unexpected updated order id: %d", id)
				}
				if closeReason != domain.OrderCloseReasonTimeout {
					t.Fatalf("unexpected close reason: %s", closeReason)
				}
				if closedAt == nil || closedAt.IsZero() {
					t.Fatal("expect closedAt assigned")
				}
				if !updatedAt.Equal(now) {
					t.Fatalf("unexpected updatedAt: %v", updatedAt)
				}
				return true, nil
			},
		},
		&mockProductGateway{
			restoreStockFn: func(_ context.Context, productID int64, quantity int32) error {
				if productID != 1002001 || quantity != 2 {
					t.Fatalf("unexpected restore args sku=%d quantity=%d", productID, quantity)
				}
				return nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)
	uc.SetTimeNowFuncForTest(func() time.Time { return now })

	items, total, err := uc.ListOrdersByUserID(context.Background(), 1001, 1, 20)
	if err != nil {
		t.Fatalf("list orders: %v", err)
	}
	if total != 2 || len(items) != 2 {
		t.Fatalf("unexpected list result total=%d len=%d", total, len(items))
	}
	if updateCalls != 1 {
		t.Fatalf("expected one timeout close, got %d", updateCalls)
	}
	if items[0].Status != domain.OrderStatusCancelled || items[0].CloseReason != domain.OrderCloseReasonTimeout {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
	if items[1].Status != domain.OrderStatusPaid {
		t.Fatalf("unexpected second item: %+v", items[1])
	}
}

// TestOrderUseCase_AdminCancelOrder_ClosesAnyOrder 验证管理员可关闭任意用户的未支付订单，且关闭原因为 ADMIN_CLOSED。
func TestOrderUseCase_AdminCancelOrder_ClosesAnyOrder(t *testing.T) {
	updated := false
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{
					ID:     id,
					UserID: 1001,
					Status: domain.OrderStatusCreated,
					Items:  []domain.OrderItem{{ProductID: 1002001, Quantity: 1}},
				}, nil
			},
			updateStatusFn: func(_ context.Context, _ int64, _, toStatus string, _ time.Time, closeReason string, _ *time.Time) (bool, error) {
				updated = true
				if toStatus != domain.OrderStatusCancelled || closeReason != domain.OrderCloseReasonAdminClosed {
					t.Fatalf("unexpected update toStatus=%s reason=%s", toStatus, closeReason)
				}
				return true, nil
			},
		},
		&mockProductGateway{restoreStockFn: func(_ context.Context, _ int64, _ int32) error { return nil }},
		&mockIdempotencyStore{},
		&mockOrderEventPublisher{},
	)

	order, err := uc.AdminCancelOrder(context.Background(), 501)
	if err != nil {
		t.Fatalf("admin cancel: %v", err)
	}
	if !updated || order.Status != domain.OrderStatusCancelled || order.CloseReason != domain.OrderCloseReasonAdminClosed {
		t.Fatalf("unexpected result: %+v", order)
	}
}

// TestOrderUseCase_AdminListOrders_NoUserFilter 验证管理员列表不限定用户并透传状态过滤。
func TestOrderUseCase_AdminListOrders_NoUserFilter(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			listAllFn: func(_ context.Context, status string, userID int64, _, _ int) ([]*domain.Order, int64, error) {
				if status != domain.OrderStatusCreated {
					t.Fatalf("expected status filter, got %q", status)
				}
				if userID != 7 {
					t.Fatalf("expected user filter 7, got %d", userID)
				}
				return []*domain.Order{{ID: 9, UserID: 7, Status: domain.OrderStatusCreated}}, 1, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{},
		&mockOrderEventPublisher{},
	)

	items, total, err := uc.AdminListOrders(context.Background(), domain.OrderStatusCreated, 7, 1, 20)
	if err != nil {
		t.Fatalf("admin list: %v", err)
	}
	if total != 1 || len(items) != 1 || items[0].UserID != 7 {
		t.Fatalf("unexpected list result total=%d len=%d", total, len(items))
	}
}

// TestOrderUseCase_CancelOrder_Success 验证已创建订单可以取消并回补库存。
func TestOrderUseCase_CancelOrder_Success(t *testing.T) {
	calledRestore := false
	calledPublish := false
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{
					ID:     id,
					UserID: 1001,
					Status: domain.OrderStatusCreated,
					Items: []domain.OrderItem{
						{ProductID: 1001002, Quantity: 2},
					},
				}, nil
			},
			updateStatusFn: func(_ context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, _ string, _ *time.Time) (bool, error) {
				if id != 301 || fromStatus != domain.OrderStatusCreated || toStatus != domain.OrderStatusCancelled {
					t.Fatalf("unexpected update args id=%d from=%s to=%s", id, fromStatus, toStatus)
				}
				if updatedAt.IsZero() {
					t.Fatal("expect updatedAt assigned")
				}
				return true, nil
			},
		},
		&mockProductGateway{
			restoreStockFn: func(_ context.Context, productID int64, quantity int32) error {
				calledRestore = true
				if productID != 1001002 || quantity != 2 {
					t.Fatalf("unexpected restore args sku=%d quantity=%d", productID, quantity)
				}
				return nil
			},
		},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{
			publishCancelledFn: func(_ context.Context, order *domain.Order) error {
				calledPublish = true
				if order == nil || order.ID != 301 || order.Status != domain.OrderStatusCancelled {
					t.Fatalf("unexpected cancelled event order: %+v", order)
				}
				return nil
			},
		},
	)

	order, err := uc.CancelOrder(context.Background(), 1001, 301)
	if err != nil {
		t.Fatalf("cancel order: %v", err)
	}
	if !calledRestore {
		t.Fatal("expect restore stock called")
	}
	if !calledPublish {
		t.Fatal("expect cancelled event published")
	}
	if order == nil || order.Status != domain.OrderStatusCancelled {
		t.Fatalf("unexpected cancelled order: %+v", order)
	}
}

// TestOrderUseCase_CancelOrder_Forbidden 验证用户不能取消他人的订单。
func TestOrderUseCase_CancelOrder_Forbidden(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, UserID: 2002, Status: domain.OrderStatusCreated}, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)

	_, err := uc.CancelOrder(context.Background(), 1001, 302)
	if !pkgerrors.IsCode(err, pkgerrors.CodeForbidden) {
		t.Fatalf("expect CodeForbidden, got %v", err)
	}
}

// TestOrderUseCase_CancelOrder_FailedPrecondition 验证非 CREATED 订单不能重复取消。
func TestOrderUseCase_CancelOrder_FailedPrecondition(t *testing.T) {
	uc := application.NewOrderUseCase(
		&mockOrderRepo{
			findByIDFn: func(_ context.Context, id int64) (*domain.Order, error) {
				return &domain.Order{ID: id, UserID: 1001, Status: domain.OrderStatusCancelled}, nil
			},
		},
		&mockProductGateway{},
		&mockIdempotencyStore{acquireFn: func(_ context.Context, _ string, _ time.Duration) (bool, error) { return true, nil }},
		&mockOrderEventPublisher{},
	)

	_, err := uc.CancelOrder(context.Background(), 1001, 303)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}
