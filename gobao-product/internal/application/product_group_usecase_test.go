package application_test

import (
	"context"
	"reflect"
	"testing"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
)

func TestProductGroupUseCase_Create_Success(t *testing.T) {
	groupRepo := &mockProductGroupRepo{
		existsBySlugFn: func(_ context.Context, slug string, excludeID int64) (bool, error) {
			return false, nil
		},
		createFn: func(_ context.Context, group *domain.ProductGroup) error {
			group.ID = 5001
			return nil
		},
	}
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "Mac"}, nil
		},
	}
	uc := application.NewProductGroupUseCase(groupRepo, catRepo)
	group, err := uc.Create(context.Background(), &domain.ProductGroup{
		Name:       "MacBook Air",
		Slug:       "macbook-air",
		CategoryID: 2,
		Status:     1,
		SortOrder:  1,
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if group.ID != 5001 {
		t.Fatalf("group id want 5001, got %d", group.ID)
	}
}

func TestProductGroupUseCase_Create_DuplicateSlug(t *testing.T) {
	groupRepo := &mockProductGroupRepo{
		existsBySlugFn: func(_ context.Context, slug string, excludeID int64) (bool, error) {
			return true, nil
		},
	}
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "Mac"}, nil
		},
	}
	uc := application.NewProductGroupUseCase(groupRepo, catRepo)
	_, err := uc.Create(context.Background(), &domain.ProductGroup{
		Name:       "MacBook Air",
		Slug:       "macbook-air",
		CategoryID: 2,
	})
	if !pkgerrors.IsCode(err, pkgerrors.CodeConflict) {
		t.Fatalf("expect CodeConflict, got %v", err)
	}
}

func TestProductGroupUseCase_Update_Success(t *testing.T) {
	wantSpecKeys := []string{"颜色", "存储"}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{ID: id, Name: "旧组", Slug: "old-group", CategoryID: 2, SpecKeys: []string{"旧维度"}}, nil
		},
		existsBySlugFn: func(_ context.Context, slug string, excludeID int64) (bool, error) {
			return false, nil
		},
		updateFn: func(_ context.Context, group *domain.ProductGroup) error {
			if !reflect.DeepEqual(group.SpecKeys, wantSpecKeys) {
				t.Fatalf("spec keys want %#v, got %#v", wantSpecKeys, group.SpecKeys)
			}
			return nil
		},
	}
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "Mac"}, nil
		},
	}
	uc := application.NewProductGroupUseCase(groupRepo, catRepo)
	group, err := uc.Update(context.Background(), 5001, &domain.ProductGroup{
		Name:       "MacBook Air",
		Slug:       "macbook-air",
		CategoryID: 2,
		Status:     1,
		SortOrder:  1,
		SpecKeys:   wantSpecKeys,
	})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if group.Name != "MacBook Air" {
		t.Fatalf("name want MacBook Air, got %s", group.Name)
	}
	if !reflect.DeepEqual(group.SpecKeys, wantSpecKeys) {
		t.Fatalf("returned spec keys want %#v, got %#v", wantSpecKeys, group.SpecKeys)
	}
}

func TestProductGroupUseCase_Delete_WithProducts(t *testing.T) {
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{ID: id, Name: "MacBook Air"}, nil
		},
		countProductsByGroupIDFn: func(_ context.Context, groupID int64) (int64, error) {
			return 2, nil
		},
	}
	uc := application.NewProductGroupUseCase(groupRepo, &mockCategoryRepo{})
	err := uc.Delete(context.Background(), 5001)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}
