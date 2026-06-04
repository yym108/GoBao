package application_test

import (
	"context"
	"errors"
	"testing"
	"time"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
)

// mockSeckillActivityRepo 用 function fields 实现 SeckillActivityRepository。
type mockSeckillActivityRepo struct {
	createFn   func(ctx context.Context, a *domain.SeckillActivity) error
	findByIDFn func(ctx context.Context, id int64) (*domain.SeckillActivity, error)
	updateFn   func(ctx context.Context, a *domain.SeckillActivity) error
}

func (m *mockSeckillActivityRepo) Create(ctx context.Context, a *domain.SeckillActivity) error {
	return m.createFn(ctx, a)
}

func (m *mockSeckillActivityRepo) FindByID(ctx context.Context, id int64) (*domain.SeckillActivity, error) {
	return m.findByIDFn(ctx, id)
}

func (m *mockSeckillActivityRepo) Update(ctx context.Context, a *domain.SeckillActivity) error {
	return m.updateFn(ctx, a)
}

// fakeSeckillStore 记录预热写入的 key/value，供测试断言。
type fakeSeckillStore struct {
	setFn   func(ctx context.Context, key string, value any, ttl time.Duration) error
	writes  map[string]any
	lastTTL map[string]time.Duration
}

func (s *fakeSeckillStore) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	if s.setFn != nil {
		return s.setFn(ctx, key, value, ttl)
	}
	if s.writes == nil {
		s.writes = make(map[string]any)
	}
	if s.lastTTL == nil {
		s.lastTTL = make(map[string]time.Duration)
	}
	s.writes[key] = value
	s.lastTTL[key] = ttl
	return nil
}

func TestSeckillUseCase_Get_NotFound(t *testing.T) {
	repo := &mockSeckillActivityRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return nil, nil
		},
	}

	uc := application.NewSeckillUseCase(&mockProductRepo{}, repo, &fakeSeckillStore{})
	_, err := uc.Get(context.Background(), 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeNotFound) {
		t.Fatalf("expect CodeNotFound, got %v", err)
	}
}

func TestSeckillUseCase_Prewarm_RejectsInactiveActivity(t *testing.T) {
	now := time.Now()
	repo := &mockSeckillActivityRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID:           id,
				ProductID:    10,
				Title:        "秒杀活动",
				SeckillPrice: 19900,
				SeckillStock: 20,
				Status:       domain.SeckillStatusDraft,
				StartAt:      now.Add(10 * time.Minute),
				EndAt:        now.Add(20 * time.Minute),
			}, nil
		},
	}
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "Phone"}, nil
		},
	}

	uc := application.NewSeckillUseCase(prodRepo, repo, &fakeSeckillStore{})
	_, _, err := uc.Prewarm(context.Background(), 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

func TestSeckillUseCase_Prewarm_RejectsProductMismatch(t *testing.T) {
	now := time.Now()
	repo := &mockSeckillActivityRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID:           id,
				ProductID:    10,
				Title:        "秒杀活动",
				SeckillPrice: 19900,
				SeckillStock: 20,
				Status:       domain.SeckillStatusActive,
				StartAt:      now.Add(10 * time.Minute),
				EndAt:        now.Add(20 * time.Minute),
			}, nil
		},
	}
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return nil, nil
		},
	}

	uc := application.NewSeckillUseCase(prodRepo, repo, &fakeSeckillStore{})
	_, _, err := uc.Prewarm(context.Background(), 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

func TestSeckillUseCase_Prewarm_WritesMetaAndStockKeys(t *testing.T) {
	now := time.Now()
	repo := &mockSeckillActivityRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID:           id,
				ProductID:    10,
				Title:        "秒杀活动",
				SeckillPrice: 19900,
				SeckillStock: 20,
				Status:       domain.SeckillStatusActive,
				StartAt:      now.Add(10 * time.Minute),
				EndAt:        now.Add(20 * time.Minute),
			}, nil
		},
	}
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "Phone"}, nil
		},
	}
	store := &fakeSeckillStore{}

	uc := application.NewSeckillUseCase(prodRepo, repo, store)
	metaKey, stockKey, err := uc.Prewarm(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if metaKey == "" || stockKey == "" {
		t.Fatalf("expect non-empty keys, got meta=%q stock=%q", metaKey, stockKey)
	}
	if _, ok := store.writes[metaKey]; !ok {
		t.Fatalf("expect meta key %q to be written", metaKey)
	}
	gotStock, ok := store.writes[stockKey]
	if !ok {
		t.Fatalf("expect stock key %q to be written", stockKey)
	}
	if gotStock != int32(20) {
		t.Fatalf("stock value want 20, got %#v", gotStock)
	}
}

func TestSeckillUseCase_Prewarm_StoreError(t *testing.T) {
	now := time.Now()
	repo := &mockSeckillActivityRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID:           id,
				ProductID:    10,
				Title:        "秒杀活动",
				SeckillPrice: 19900,
				SeckillStock: 20,
				Status:       domain.SeckillStatusActive,
				StartAt:      now.Add(10 * time.Minute),
				EndAt:        now.Add(20 * time.Minute),
			}, nil
		},
	}
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "Phone"}, nil
		},
	}
	store := &fakeSeckillStore{
		setFn: func(_ context.Context, key string, value any, ttl time.Duration) error {
			if key == "seckill:activity:1:meta" {
				return errors.New("redis down")
			}
			return nil
		},
	}

	uc := application.NewSeckillUseCase(prodRepo, repo, store)
	_, _, err := uc.Prewarm(context.Background(), 1)
	if err == nil {
		t.Fatalf("expect error when store write fails")
	}
}
