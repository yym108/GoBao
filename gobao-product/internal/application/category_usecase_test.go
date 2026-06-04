package application_test

import (
	"context"
	"testing"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
)

// mockCategoryRepo 用 function fields 实现 CategoryRepository,
// 每个测试只需注入它关心的方法,未注入的方法被调到时会 panic 暴露问题。
type mockCategoryRepo struct {
	createFn       func(ctx context.Context, c *domain.Category) error
	findByIDFn     func(ctx context.Context, id int64) (*domain.Category, error)
	listFn         func(ctx context.Context) ([]*domain.Category, error)
	updateFn       func(ctx context.Context, c *domain.Category) error
	deleteFn       func(ctx context.Context, id int64) error
	existsByNameFn func(ctx context.Context, name string, excludeID int64) (bool, error)
}

func (m *mockCategoryRepo) Create(ctx context.Context, c *domain.Category) error {
	return m.createFn(ctx, c)
}
func (m *mockCategoryRepo) FindByID(ctx context.Context, id int64) (*domain.Category, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockCategoryRepo) List(ctx context.Context) ([]*domain.Category, error) {
	return m.listFn(ctx)
}
func (m *mockCategoryRepo) Update(ctx context.Context, c *domain.Category) error {
	return m.updateFn(ctx, c)
}
func (m *mockCategoryRepo) Delete(ctx context.Context, id int64) error {
	return m.deleteFn(ctx, id)
}
func (m *mockCategoryRepo) ExistsByName(ctx context.Context, name string, excludeID int64) (bool, error) {
	return m.existsByNameFn(ctx, name, excludeID)
}

type mockCategoryCleanupGroupRepo struct {
	clearCategoryByCategoryIDFn func(ctx context.Context, categoryID int64) error
}

func (m *mockCategoryCleanupGroupRepo) FindByID(ctx context.Context, id int64) (*domain.ProductGroup, error) {
	panic("unexpected call to FindByID")
}
func (m *mockCategoryCleanupGroupRepo) List(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error) {
	panic("unexpected call to List")
}
func (m *mockCategoryCleanupGroupRepo) ListProductsByGroupID(ctx context.Context, groupID int64) ([]*domain.Product, error) {
	panic("unexpected call to ListProductsByGroupID")
}
func (m *mockCategoryCleanupGroupRepo) Create(ctx context.Context, group *domain.ProductGroup) error {
	panic("unexpected call to Create")
}
func (m *mockCategoryCleanupGroupRepo) Update(ctx context.Context, group *domain.ProductGroup) error {
	panic("unexpected call to Update")
}
func (m *mockCategoryCleanupGroupRepo) Delete(ctx context.Context, id int64) error {
	panic("unexpected call to Delete")
}
func (m *mockCategoryCleanupGroupRepo) ExistsBySlug(ctx context.Context, slug string, excludeID int64) (bool, error) {
	panic("unexpected call to ExistsBySlug")
}
func (m *mockCategoryCleanupGroupRepo) CountProductsByGroupID(ctx context.Context, groupID int64) (int64, error) {
	panic("unexpected call to CountProductsByGroupID")
}
func (m *mockCategoryCleanupGroupRepo) CountByCategoryID(ctx context.Context, categoryID int64) (int64, error) {
	panic("unexpected call to CountByCategoryID")
}
func (m *mockCategoryCleanupGroupRepo) ClearCategoryByCategoryID(ctx context.Context, categoryID int64) error {
	if m.clearCategoryByCategoryIDFn != nil {
		return m.clearCategoryByCategoryIDFn(ctx, categoryID)
	}
	return nil
}

func TestCategoryUseCase_Create_Success(t *testing.T) {
	repo := &mockCategoryRepo{
		existsByNameFn: func(_ context.Context, name string, exclude int64) (bool, error) {
			return false, nil
		},
		createFn: func(_ context.Context, c *domain.Category) error {
			c.ID = 100
			return nil
		},
	}
	uc := application.NewCategoryUseCase(repo, nil)
	got, err := uc.Create(context.Background(), "电子产品", 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.ID != 100 || got.Name != "电子产品" {
		t.Fatalf("got %+v", got)
	}
}

func TestCategoryUseCase_Create_DuplicateName(t *testing.T) {
	repo := &mockCategoryRepo{
		existsByNameFn: func(_ context.Context, name string, exclude int64) (bool, error) {
			return true, nil
		},
	}
	uc := application.NewCategoryUseCase(repo, nil)
	_, err := uc.Create(context.Background(), "已存在", 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeConflict) {
		t.Fatalf("expect CodeConflict, got %v", err)
	}
}

func TestCategoryUseCase_Create_EmptyName(t *testing.T) {
	uc := application.NewCategoryUseCase(&mockCategoryRepo{}, nil)
	_, err := uc.Create(context.Background(), "", 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeInvalidArg) {
		t.Fatalf("expect CodeInvalidArg, got %v", err)
	}
}

func TestCategoryUseCase_Delete_NotFound(t *testing.T) {
	repo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return nil, nil
		},
	}
	uc := application.NewCategoryUseCase(repo, nil)
	err := uc.Delete(context.Background(), 999)
	if !pkgerrors.IsCode(err, pkgerrors.CodeNotFound) {
		t.Fatalf("expect CodeNotFound, got %v", err)
	}
}

func TestCategoryUseCase_Delete_Success(t *testing.T) {
	clearedCategoryID := int64(0)
	repo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id}, nil
		},
		deleteFn: func(_ context.Context, id int64) error { return nil },
	}
	groupRepo := &mockCategoryCleanupGroupRepo{
		clearCategoryByCategoryIDFn: func(_ context.Context, id int64) error {
			clearedCategoryID = id
			return nil
		},
	}
	uc := application.NewCategoryUseCase(repo, groupRepo)
	if err := uc.Delete(context.Background(), 1); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if clearedCategoryID != 1 {
		t.Fatalf("expect clear category id 1, got %d", clearedCategoryID)
	}
}

func TestCategoryUseCase_Update_DuplicateName(t *testing.T) {
	repo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "old"}, nil
		},
		existsByNameFn: func(_ context.Context, name string, exclude int64) (bool, error) {
			return true, nil
		},
	}
	uc := application.NewCategoryUseCase(repo, nil)
	_, err := uc.Update(context.Background(), 1, "重复名", 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeConflict) {
		t.Fatalf("expect CodeConflict, got %v", err)
	}
}
