package application_test

import (
	"context"
	"testing"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
)

func TestStockUseCase_Deduct_Success(t *testing.T) {
	stockRepo := &mockStockRepo{
		deductFn: func(_ context.Context, productID int64, qty int32) (int32, error) {
			if productID != 1001002 {
				t.Fatalf("expected productID 1001002, got %d", productID)
			}
			return 5, nil
		},
	}
	uc := application.NewStockUseCase(&mockProductRepo{}, stockRepo)
	remaining, err := uc.DeductStock(context.Background(), 1001002, 10)
	if err != nil || remaining != 5 {
		t.Fatalf("unexpected: remaining=%d, err=%v", remaining, err)
	}
}

func TestStockUseCase_Deduct_ProductNotFound(t *testing.T) {
	uc := application.NewStockUseCase(&mockProductRepo{}, &mockStockRepo{})
	_, err := uc.DeductStock(context.Background(), 99, 1)
	if err != nil {
		t.Fatalf("expect product-level stock deduct not depend on product repo, got %v", err)
	}
}

func TestStockUseCase_Deduct_ZeroQuantity(t *testing.T) {
	uc := application.NewStockUseCase(&mockProductRepo{}, &mockStockRepo{})
	_, err := uc.DeductStock(context.Background(), 1001002, 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeInvalidArg) {
		t.Fatalf("expect CodeInvalidArg, got %v", err)
	}
}

func TestStockUseCase_Deduct_CASConflict(t *testing.T) {
	stockRepo := &mockStockRepo{
		deductFn: func(_ context.Context, productID int64, qty int32) (int32, error) {
			return 0, domain.ErrStockCASConflict
		},
	}
	uc := application.NewStockUseCase(&mockProductRepo{}, stockRepo)
	_, err := uc.DeductStock(context.Background(), 1001002, 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeAborted) {
		t.Fatalf("expect CodeAborted, got %v", err)
	}
}

func TestStockUseCase_Restore_Success(t *testing.T) {
	stockRepo := &mockStockRepo{
		restoreFn: func(_ context.Context, productID int64, qty int32) (int32, error) {
			if productID != 1001002 {
				t.Fatalf("expected productID 1001002, got %d", productID)
			}
			return 15, nil
		},
	}
	uc := application.NewStockUseCase(&mockProductRepo{}, stockRepo)
	remaining, err := uc.RestoreStock(context.Background(), 1001002, 10)
	if err != nil || remaining != 15 {
		t.Fatalf("unexpected: remaining=%d, err=%v", remaining, err)
	}
}

func TestStockUseCase_Restore_CASConflict(t *testing.T) {
	stockRepo := &mockStockRepo{
		restoreFn: func(_ context.Context, productID int64, qty int32) (int32, error) {
			return 0, domain.ErrStockCASConflict
		},
	}
	uc := application.NewStockUseCase(&mockProductRepo{}, stockRepo)
	_, err := uc.RestoreStock(context.Background(), 1001002, 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeAborted) {
		t.Fatalf("expect CodeAborted, got %v", err)
	}
}

func TestStockUseCase_Update_Success(t *testing.T) {
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id}, nil
		},
	}
	stockRepo := &mockStockRepo{
		setQuantityFn: func(_ context.Context, productID int64, qty int32, expectedVersion int32) error {
			if expectedVersion != 3 {
				t.Fatalf("expectedVersion want 3, got %d", expectedVersion)
			}
			return nil
		},
	}
	uc := application.NewStockUseCase(prodRepo, stockRepo)
	err := uc.UpdateStock(context.Background(), 1, 200, 3)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
}

func TestStockUseCase_Update_NegativeQuantity(t *testing.T) {
	uc := application.NewStockUseCase(&mockProductRepo{}, &mockStockRepo{})
	err := uc.UpdateStock(context.Background(), 1, -1, 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeInvalidArg) {
		t.Fatalf("expect CodeInvalidArg, got %v", err)
	}
}

func TestStockUseCase_Update_CASConflict(t *testing.T) {
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id}, nil
		},
	}
	stockRepo := &mockStockRepo{
		setQuantityFn: func(_ context.Context, productID int64, qty int32, expectedVersion int32) error {
			return domain.ErrStockCASConflict
		},
	}
	uc := application.NewStockUseCase(prodRepo, stockRepo)
	err := uc.UpdateStock(context.Background(), 1, 50, 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeAborted) {
		t.Fatalf("expect CodeAborted, got %v", err)
	}
}
