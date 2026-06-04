package redisrepo

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"

	"github.com/yym108/gobao-product/internal/domain"
)

// fakeStockRepo 内存版底层库存仓储,充当 MySQL 种子/备份角色。
type fakeStockRepo struct {
	stocks map[int64]*domain.Stock
}

func newFakeStockRepo() *fakeStockRepo { return &fakeStockRepo{stocks: map[int64]*domain.Stock{}} }

func (f *fakeStockRepo) Create(_ context.Context, s *domain.Stock) error {
	f.stocks[s.ProductID] = &domain.Stock{ProductID: s.ProductID, Quantity: s.Quantity, Version: s.Version}
	return nil
}

func (f *fakeStockRepo) FindByProductID(_ context.Context, productID int64) (*domain.Stock, error) {
	s, ok := f.stocks[productID]
	if !ok {
		return nil, nil
	}
	cp := *s
	return &cp, nil
}

func (f *fakeStockRepo) Deduct(context.Context, int64, int32) (int32, error) { return 0, nil }
func (f *fakeStockRepo) Restore(context.Context, int64, int32) (int32, error) { return 0, nil }

func (f *fakeStockRepo) SetQuantity(_ context.Context, productID int64, quantity, _ int32) error {
	if s, ok := f.stocks[productID]; ok {
		s.Quantity = quantity
		s.Version++
	}
	return nil
}

func setupStore(t *testing.T) (*StockStore, *fakeStockRepo, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	rdb := goredis.NewClient(&goredis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	inner := newFakeStockRepo()
	return NewStockStore(rdb, inner), inner, mr
}

func TestStockStore_Deduct_SeedsThenDecrements(t *testing.T) {
	store, inner, _ := setupStore(t)
	inner.stocks[1] = &domain.Stock{ProductID: 1, Quantity: 100, Version: 0}

	// 首次扣减时 Redis 无键,应回源预热后扣减。
	remaining, err := store.Deduct(context.Background(), 1, 30)
	if err != nil || remaining != 70 {
		t.Fatalf("deduct: remaining=%d err=%v", remaining, err)
	}
	remaining, err = store.Deduct(context.Background(), 1, 20)
	if err != nil || remaining != 50 {
		t.Fatalf("deduct2: remaining=%d err=%v", remaining, err)
	}
}

func TestStockStore_Deduct_Insufficient(t *testing.T) {
	store, inner, _ := setupStore(t)
	inner.stocks[2] = &domain.Stock{ProductID: 2, Quantity: 5}

	_, err := store.Deduct(context.Background(), 2, 10)
	if err != domain.ErrStockCASConflict {
		t.Fatalf("expect ErrStockCASConflict, got %v", err)
	}
}

func TestStockStore_Deduct_MissingProduct(t *testing.T) {
	store, _, _ := setupStore(t)
	_, err := store.Deduct(context.Background(), 999, 1)
	if err != domain.ErrStockCASConflict {
		t.Fatalf("expect ErrStockCASConflict for missing product, got %v", err)
	}
}

func TestStockStore_Restore(t *testing.T) {
	store, inner, _ := setupStore(t)
	inner.stocks[3] = &domain.Stock{ProductID: 3, Quantity: 10}
	if _, err := store.Deduct(context.Background(), 3, 4); err != nil {
		t.Fatalf("deduct: %v", err)
	}
	remaining, err := store.Restore(context.Background(), 3, 2)
	if err != nil || remaining != 8 {
		t.Fatalf("restore: remaining=%d err=%v", remaining, err)
	}
}

func TestStockStore_FindByProductID_OverlaysRedisQuantity(t *testing.T) {
	store, inner, _ := setupStore(t)
	inner.stocks[4] = &domain.Stock{ProductID: 4, Quantity: 100, Version: 7}
	if _, err := store.Deduct(context.Background(), 4, 40); err != nil {
		t.Fatalf("deduct: %v", err)
	}
	st, err := store.FindByProductID(context.Background(), 4)
	if err != nil || st == nil {
		t.Fatalf("find: %+v err=%v", st, err)
	}
	if st.Quantity != 60 { // Redis 实时数量
		t.Fatalf("expect live quantity 60, got %d", st.Quantity)
	}
	if st.Version != 7 { // 版本仍来自 MySQL
		t.Fatalf("expect version 7, got %d", st.Version)
	}
}

func TestStockStore_SetQuantity_UpdatesBoth(t *testing.T) {
	store, inner, mr := setupStore(t)
	inner.stocks[5] = &domain.Stock{ProductID: 5, Quantity: 10, Version: 0}
	if _, err := store.Deduct(context.Background(), 5, 5); err != nil {
		t.Fatalf("deduct: %v", err)
	}
	if err := store.SetQuantity(context.Background(), 5, 200, 0); err != nil {
		t.Fatalf("set: %v", err)
	}
	v, _ := mr.Get(stockKey(5))
	if v != "200" {
		t.Fatalf("expect redis 200, got %q", v)
	}
	if inner.stocks[5].Quantity != 200 {
		t.Fatalf("expect mysql 200, got %d", inner.stocks[5].Quantity)
	}
}
