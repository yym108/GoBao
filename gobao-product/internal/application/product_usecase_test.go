package application_test

import (
	"context"
	"testing"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
)

// ---------- mockProductRepo ----------

// mockProductRepo 用 function fields 实现 ProductRepository。
type mockProductRepo struct {
	createFn     func(ctx context.Context, p *domain.Product) error
	findByIDFn   func(ctx context.Context, id int64) (*domain.Product, error)
	listFn       func(ctx context.Context, categoryID int64, page, pageSize int) ([]*domain.Product, int64, error)
	updateFn     func(ctx context.Context, p *domain.Product) error
	softDeleteFn func(ctx context.Context, id int64) error
}

func (m *mockProductRepo) Create(ctx context.Context, p *domain.Product) error {
	return m.createFn(ctx, p)
}
func (m *mockProductRepo) FindByID(ctx context.Context, id int64) (*domain.Product, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockProductRepo) List(ctx context.Context, categoryID int64, page, pageSize int) ([]*domain.Product, int64, error) {
	return m.listFn(ctx, categoryID, page, pageSize)
}
func (m *mockProductRepo) Update(ctx context.Context, p *domain.Product) error {
	return m.updateFn(ctx, p)
}
func (m *mockProductRepo) SoftDelete(ctx context.Context, id int64) error {
	return m.softDeleteFn(ctx, id)
}

// ---------- mockStockRepo ----------

// mockStockRepo 用 function fields 实现 StockRepository。
type mockStockRepo struct {
	createFn          func(ctx context.Context, s *domain.Stock) error
	findByProductIDFn func(ctx context.Context, productID int64) (*domain.Stock, error)
	deductFn          func(ctx context.Context, productID int64, quantity int32) (int32, error)
	restoreFn         func(ctx context.Context, productID int64, quantity int32) (int32, error)
	setQuantityFn     func(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error
}

func (m *mockStockRepo) Create(ctx context.Context, s *domain.Stock) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, s)
}
func (m *mockStockRepo) FindByProductID(ctx context.Context, productID int64) (*domain.Stock, error) {
	if m.findByProductIDFn == nil {
		return nil, nil
	}
	return m.findByProductIDFn(ctx, productID)
}
func (m *mockStockRepo) Deduct(ctx context.Context, productID int64, quantity int32) (int32, error) {
	if m.deductFn == nil {
		return 0, nil
	}
	return m.deductFn(ctx, productID, quantity)
}
func (m *mockStockRepo) Restore(ctx context.Context, productID int64, quantity int32) (int32, error) {
	if m.restoreFn == nil {
		return 0, nil
	}
	return m.restoreFn(ctx, productID, quantity)
}
func (m *mockStockRepo) SetQuantity(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error {
	if m.setQuantityFn == nil {
		return nil
	}
	return m.setQuantityFn(ctx, productID, quantity, expectedVersion)
}

// ---------- mockProductGroupRepo ----------

// mockProductGroupRepo 用 function fields 实现 ProductGroupRepository。
type mockProductGroupRepo struct {
	findByIDFn               func(ctx context.Context, id int64) (*domain.ProductGroup, error)
	listFn                   func(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error)
	listProductsByGroupIDFn  func(ctx context.Context, groupID int64) ([]*domain.Product, error)
	createFn                 func(ctx context.Context, group *domain.ProductGroup) error
	updateFn                 func(ctx context.Context, group *domain.ProductGroup) error
	deleteFn                 func(ctx context.Context, id int64) error
	existsBySlugFn           func(ctx context.Context, slug string, excludeID int64) (bool, error)
	countProductsByGroupIDFn func(ctx context.Context, groupID int64) (int64, error)
	countByCategoryIDFn      func(ctx context.Context, categoryID int64) (int64, error)
	clearCategoryByIDFn      func(ctx context.Context, categoryID int64) error
}

// mockProductGroupMediaRepo 用 function fields 实现 ProductGroupMediaRepository。
type mockProductGroupMediaRepo struct {
	listByGroupIDFn func(ctx context.Context, groupID int64) ([]domain.ProductGroupMediaBinding, error)
	createFn        func(ctx context.Context, binding *domain.ProductGroupMediaBinding) error
	updateFn        func(ctx context.Context, binding *domain.ProductGroupMediaBinding) error
	deleteFn        func(ctx context.Context, groupID int64, bindingID int64) error
}

func (m *mockProductGroupMediaRepo) ListByGroupID(ctx context.Context, groupID int64) ([]domain.ProductGroupMediaBinding, error) {
	if m.listByGroupIDFn == nil {
		return []domain.ProductGroupMediaBinding{}, nil
	}
	return m.listByGroupIDFn(ctx, groupID)
}

func (m *mockProductGroupMediaRepo) Create(ctx context.Context, binding *domain.ProductGroupMediaBinding) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, binding)
}

func (m *mockProductGroupMediaRepo) Update(ctx context.Context, binding *domain.ProductGroupMediaBinding) error {
	if m.updateFn == nil {
		return nil
	}
	return m.updateFn(ctx, binding)
}

func (m *mockProductGroupMediaRepo) Delete(ctx context.Context, groupID int64, bindingID int64) error {
	if m.deleteFn == nil {
		return nil
	}
	return m.deleteFn(ctx, groupID, bindingID)
}

// mockProductMediaRepo 用 function fields 实现 ProductMediaRepository。
type mockProductMediaRepo struct {
	listByProductIDFn func(ctx context.Context, productID int64) ([]domain.ProductMediaBinding, error)
	createFn          func(ctx context.Context, binding *domain.ProductMediaBinding) error
	updateFn          func(ctx context.Context, binding *domain.ProductMediaBinding) error
	deleteFn          func(ctx context.Context, productID int64, bindingID int64) error
}

func (m *mockProductMediaRepo) ListByProductID(ctx context.Context, productID int64) ([]domain.ProductMediaBinding, error) {
	if m.listByProductIDFn == nil {
		return []domain.ProductMediaBinding{}, nil
	}
	return m.listByProductIDFn(ctx, productID)
}

func (m *mockProductMediaRepo) Create(ctx context.Context, binding *domain.ProductMediaBinding) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, binding)
}

func (m *mockProductMediaRepo) Update(ctx context.Context, binding *domain.ProductMediaBinding) error {
	if m.updateFn == nil {
		return nil
	}
	return m.updateFn(ctx, binding)
}

func (m *mockProductMediaRepo) Delete(ctx context.Context, productID int64, bindingID int64) error {
	if m.deleteFn == nil {
		return nil
	}
	return m.deleteFn(ctx, productID, bindingID)
}

func (m *mockProductGroupRepo) FindByID(ctx context.Context, id int64) (*domain.ProductGroup, error) {
	if m.findByIDFn == nil {
		return nil, nil
	}
	return m.findByIDFn(ctx, id)
}

func (m *mockProductGroupRepo) List(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error) {
	if m.listFn == nil {
		return []domain.ProductGroup{}, 0, nil
	}
	return m.listFn(ctx, categoryID, page, pageSize)
}

func (m *mockProductGroupRepo) ListProductsByGroupID(ctx context.Context, groupID int64) ([]*domain.Product, error) {
	if m.listProductsByGroupIDFn == nil {
		return []*domain.Product{}, nil
	}
	return m.listProductsByGroupIDFn(ctx, groupID)
}

func (m *mockProductGroupRepo) Create(ctx context.Context, group *domain.ProductGroup) error {
	if m.createFn == nil {
		return nil
	}
	return m.createFn(ctx, group)
}

func (m *mockProductGroupRepo) Update(ctx context.Context, group *domain.ProductGroup) error {
	if m.updateFn == nil {
		return nil
	}
	return m.updateFn(ctx, group)
}

func (m *mockProductGroupRepo) Delete(ctx context.Context, id int64) error {
	if m.deleteFn == nil {
		return nil
	}
	return m.deleteFn(ctx, id)
}

func (m *mockProductGroupRepo) ExistsBySlug(ctx context.Context, slug string, excludeID int64) (bool, error) {
	if m.existsBySlugFn == nil {
		return false, nil
	}
	return m.existsBySlugFn(ctx, slug, excludeID)
}

func (m *mockProductGroupRepo) CountProductsByGroupID(ctx context.Context, groupID int64) (int64, error) {
	if m.countProductsByGroupIDFn == nil {
		return 0, nil
	}
	return m.countProductsByGroupIDFn(ctx, groupID)
}

func (m *mockProductGroupRepo) CountByCategoryID(ctx context.Context, categoryID int64) (int64, error) {
	if m.countByCategoryIDFn == nil {
		return 0, nil
	}
	return m.countByCategoryIDFn(ctx, categoryID)
}

func (m *mockProductGroupRepo) ClearCategoryByCategoryID(ctx context.Context, categoryID int64) error {
	if m.clearCategoryByIDFn == nil {
		return nil
	}
	return m.clearCategoryByIDFn(ctx, categoryID)
}

// ---------- ProductUseCase 测试 ----------

func TestProductUseCase_Create_Success(t *testing.T) {
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "类目"}, nil
		},
	}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{ID: id, Name: "商品组"}, nil
		},
	}
	prodRepo := &mockProductRepo{
		createFn: func(_ context.Context, p *domain.Product) error {
			p.ID = 10
			return nil
		},
	}
	stockRepo := &mockStockRepo{
		createFn: func(_ context.Context, s *domain.Stock) error { return nil },
	}
	uc := application.NewProductUseCase(prodRepo, groupRepo, catRepo, stockRepo)
	got, err := uc.Create(context.Background(), &domain.Product{Name: "iPhone", Price: 99900, CategoryID: 1, GroupID: 10, Status: domain.ProductStatusOnSale}, 100)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if got.ID != 10 {
		t.Fatalf("id want 10, got %d", got.ID)
	}
}

func TestProductUseCase_Create_CategoryNotFound(t *testing.T) {
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return nil, nil
		},
	}
	uc := application.NewProductUseCase(&mockProductRepo{}, &mockProductGroupRepo{}, catRepo, &mockStockRepo{})
	_, err := uc.Create(context.Background(), &domain.Product{Name: "x", Price: 1, CategoryID: 99, GroupID: 10}, 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

func TestProductUseCase_Create_NegativePrice(t *testing.T) {
	uc := application.NewProductUseCase(&mockProductRepo{}, &mockProductGroupRepo{}, &mockCategoryRepo{}, &mockStockRepo{})
	_, err := uc.Create(context.Background(), &domain.Product{Name: "x", Price: -1, GroupID: 10}, 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeInvalidArg) {
		t.Fatalf("expect CodeInvalidArg, got %v", err)
	}
}

func TestProductUseCase_Create_GroupNotFound(t *testing.T) {
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id, Name: "类目"}, nil
		},
	}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return nil, nil
		},
	}
	uc := application.NewProductUseCase(&mockProductRepo{}, groupRepo, catRepo, &mockStockRepo{})
	_, err := uc.Create(context.Background(), &domain.Product{Name: "x", Price: 1, CategoryID: 1, GroupID: 99}, 0)
	if !pkgerrors.IsCode(err, pkgerrors.CodeFailedPrecondition) {
		t.Fatalf("expect CodeFailedPrecondition, got %v", err)
	}
}

func TestProductUseCase_Get_NotFound(t *testing.T) {
	repo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return nil, nil
		},
	}
	uc := application.NewProductUseCase(repo, &mockProductGroupRepo{}, &mockCategoryRepo{}, &mockStockRepo{})
	_, err := uc.Get(context.Background(), 1)
	if !pkgerrors.IsCode(err, pkgerrors.CodeNotFound) {
		t.Fatalf("expect CodeNotFound, got %v", err)
	}
}

func TestProductUseCase_Get_Success(t *testing.T) {
	repo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "Book"}, nil
		},
	}
	stockRepo := &mockStockRepo{
		findByProductIDFn: func(_ context.Context, id int64) (*domain.Stock, error) {
			return &domain.Stock{ProductID: id, Quantity: 42}, nil
		},
	}
	uc := application.NewProductUseCase(repo, &mockProductGroupRepo{}, &mockCategoryRepo{}, stockRepo)
	got, err := uc.Get(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if got.StockQuantity != 42 {
		t.Fatalf("stock want 42(from stock repo), got %d", got.StockQuantity)
	}
}

func TestProductUseCase_List(t *testing.T) {
	repo := &mockProductRepo{
		listFn: func(_ context.Context, catID int64, page, size int) ([]*domain.Product, int64, error) {
			return []*domain.Product{{ID: 1}}, 1, nil
		},
	}
	uc := application.NewProductUseCase(repo, &mockProductGroupRepo{}, &mockCategoryRepo{}, &mockStockRepo{})
	items, total, err := uc.List(context.Background(), 0, 1, 20)
	if err != nil || total != 1 || len(items) != 1 {
		t.Fatalf("unexpected: err=%v, total=%d, len=%d", err, total, len(items))
	}
}

func TestProductUseCase_Update_Success(t *testing.T) {
	catRepo := &mockCategoryRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Category, error) {
			return &domain.Category{ID: id}, nil
		},
	}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{ID: id, Name: "商品组"}, nil
		},
	}
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "old", CategoryID: 1, GroupID: 10}, nil
		},
		updateFn: func(_ context.Context, p *domain.Product) error { return nil },
	}
	uc := application.NewProductUseCase(prodRepo, groupRepo, catRepo, &mockStockRepo{})
	got, err := uc.Update(context.Background(), 1, &domain.Product{Name: "new", Price: 100, CategoryID: 2, GroupID: 11})
	if err != nil || got.Name != "new" {
		t.Fatalf("unexpected: %+v, err=%v", got, err)
	}
}

func TestProductUseCase_SoftDelete(t *testing.T) {
	repo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id}, nil
		},
		softDeleteFn: func(_ context.Context, id int64) error { return nil },
	}
	uc := application.NewProductUseCase(repo, &mockProductGroupRepo{}, &mockCategoryRepo{}, &mockStockRepo{})
	if err := uc.SoftDelete(context.Background(), 1); err != nil {
		t.Fatalf("unexpected: %v", err)
	}
}

func TestProductUseCase_GetProductDetail_ReturnsGroupAndVariants(t *testing.T) {
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{
				ID:         id,
				GroupID:    10,
				Name:       "MacBook Air 13",
				Price:      899900,
				CategoryID: 1,
				SpecLabel:  "16GB / 256GB",
				ImageURL:   "https://example.com/macbook-air-256.png",
				Status:     domain.ProductStatusOnSale,
				SortOrder:  1,
			}, nil
		},
	}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{
				ID:           id,
				Name:         "MacBook Air 13",
				Slug:         "macbook-air-13",
				HeroTitle:    "轻薄，迅捷",
				HeroSubtitle: "M4 芯片",
				HeroImageURL: "https://example.com/macbook-air-hero.png",
				CategoryID:   1,
				Status:       1,
				SortOrder:    1,
			}, nil
		},
		listProductsByGroupIDFn: func(_ context.Context, groupID int64) ([]*domain.Product, error) {
			return []*domain.Product{
				{
					ID:         1,
					GroupID:    groupID,
					Name:       "MacBook Air 13",
					Price:      899900,
					CategoryID: 1,
					SpecLabel:  "16GB / 256GB",
					ImageURL:   "https://example.com/macbook-air-256.png",
					Status:     domain.ProductStatusOnSale,
					SortOrder:  1,
				},
				{
					ID:         1002,
					GroupID:    groupID,
					Name:       "MacBook Air 13",
					Price:      1099900,
					CategoryID: 1,
					SpecLabel:  "16GB / 512GB",
					ImageURL:   "https://example.com/macbook-air-512.png",
					Status:     domain.ProductStatusOnSale,
					SortOrder:  2,
				},
			}, nil
		},
	}
	stockRepo := &mockStockRepo{
		findByProductIDFn: func(_ context.Context, id int64) (*domain.Stock, error) {
			switch id {
			case 1:
				return &domain.Stock{ProductID: 1, Quantity: 12}, nil
			case 1002:
				return &domain.Stock{ProductID: 1002, Quantity: 8}, nil
			default:
				return nil, nil
			}
		},
	}

	groupMediaRepo := &mockProductGroupMediaRepo{
		listByGroupIDFn: func(_ context.Context, groupID int64) ([]domain.ProductGroupMediaBinding, error) {
			return []domain.ProductGroupMediaBinding{
				{
					ID:        8001,
					GroupID:   groupID,
					MediaID:   9002,
					UsageType: domain.MediaUsageTypeCover,
					SortOrder: 1,
					IsPrimary: true,
					Media: &domain.MediaAsset{
						ID:        9002,
						PublicURL: "https://img.example.com/group-cover.jpg",
						AltText:   "group cover",
					},
				},
				{
					ID:        8002,
					GroupID:   groupID,
					MediaID:   9003,
					UsageType: domain.MediaUsageTypeHero,
					SortOrder: 2,
					IsPrimary: false,
					Media: &domain.MediaAsset{
						ID:        9003,
						PublicURL: "https://img.example.com/group-hero.jpg",
						AltText:   "group hero",
					},
				},
				{
					ID:        8003,
					GroupID:   groupID,
					MediaID:   9004,
					UsageType: domain.MediaUsageTypeGallery,
					SortOrder: 3,
					IsPrimary: false,
					Media: &domain.MediaAsset{
						ID:        9004,
						PublicURL: "https://img.example.com/group-gallery-1.jpg",
						AltText:   "group gallery 1",
					},
				},
			}, nil
		},
	}
	productMediaRepo := &mockProductMediaRepo{
		listByProductIDFn: func(_ context.Context, productID int64) ([]domain.ProductMediaBinding, error) {
			return []domain.ProductMediaBinding{
				{
					ID:        8101,
					ProductID: productID,
					MediaID:   9001,
					UsageType: domain.MediaUsageTypeGallery,
					SortOrder: 1,
					IsPrimary: true,
					Media: &domain.MediaAsset{
						ID:        9001,
						PublicURL: "https://img.example.com/product-primary.jpg",
						AltText:   "product primary",
					},
				},
			}, nil
		},
	}

	uc := application.NewProductUseCase(prodRepo, groupRepo, &mockCategoryRepo{}, stockRepo).
		AttachMediaRepos(groupMediaRepo, productMediaRepo)
	view, err := uc.GetProductDetail(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if view.Group == nil || view.Group.ID != 10 {
		t.Fatalf("unexpected group: %+v", view.Group)
	}
	if view.Product == nil || view.Product.ID != 1 {
		t.Fatalf("unexpected product: %+v", view.Product)
	}
	if len(view.Variants) != 2 {
		t.Fatalf("variants len want 2, got %d", len(view.Variants))
	}
	if view.DefaultProductID != 1 {
		t.Fatalf("default product id want 1, got %d", view.DefaultProductID)
	}
	if view.Variants[1].ID != 1002 || view.Variants[1].StockQuantity != 8 {
		t.Fatalf("unexpected variants: %+v", view.Variants)
	}
}

func TestProductUseCase_GetProductDetail_ReturnsMediaGallery(t *testing.T) {
	prodRepo := &mockProductRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{
				ID:         id,
				GroupID:    10,
				Name:       "MacBook Air 13",
				Price:      899900,
				CategoryID: 1,
				SpecLabel:  "16GB / 256GB",
				ImageURL:   "https://img.example.com/product-primary.jpg",
				Status:     domain.ProductStatusOnSale,
				SortOrder:  1,
			}, nil
		},
	}
	groupRepo := &mockProductGroupRepo{
		findByIDFn: func(_ context.Context, id int64) (*domain.ProductGroup, error) {
			return &domain.ProductGroup{
				ID:            id,
				Name:          "MacBook Air 13",
				Slug:          "macbook-air-13",
				HeroTitle:     "轻薄，迅捷",
				HeroSubtitle:  "M4 芯片",
				HeroImageURL:  "https://img.example.com/group-hero.jpg",
				CoverImageURL: "https://img.example.com/group-cover.jpg",
				CategoryID:    1,
				Status:        1,
				SortOrder:     1,
			}, nil
		},
		listProductsByGroupIDFn: func(_ context.Context, groupID int64) ([]*domain.Product, error) {
			return []*domain.Product{
				{
					ID:         1001,
					GroupID:    groupID,
					Name:       "MacBook Air 13",
					Price:      899900,
					CategoryID: 1,
					SpecLabel:  "16GB / 256GB",
					ImageURL:   "https://img.example.com/product-primary.jpg",
					Status:     domain.ProductStatusOnSale,
					SortOrder:  1,
				},
			}, nil
		},
	}
	stockRepo := &mockStockRepo{
		findByProductIDFn: func(_ context.Context, id int64) (*domain.Stock, error) {
			return &domain.Stock{ProductID: id, Quantity: 6}, nil
		},
	}
	groupMediaRepo := &mockProductGroupMediaRepo{
		listByGroupIDFn: func(_ context.Context, groupID int64) ([]domain.ProductGroupMediaBinding, error) {
			return []domain.ProductGroupMediaBinding{
				{
					ID:        8001,
					GroupID:   groupID,
					MediaID:   9002,
					UsageType: domain.MediaUsageTypeCover,
					SortOrder: 1,
					IsPrimary: true,
					Media: &domain.MediaAsset{
						ID:        9002,
						PublicURL: "https://img.example.com/group-cover.jpg",
						AltText:   "group cover",
					},
				},
				{
					ID:        8002,
					GroupID:   groupID,
					MediaID:   9003,
					UsageType: domain.MediaUsageTypeHero,
					SortOrder: 2,
					IsPrimary: false,
					Media: &domain.MediaAsset{
						ID:        9003,
						PublicURL: "https://img.example.com/group-hero.jpg",
						AltText:   "group hero",
					},
				},
				{
					ID:        8003,
					GroupID:   groupID,
					MediaID:   9004,
					UsageType: domain.MediaUsageTypeGallery,
					SortOrder: 3,
					IsPrimary: false,
					Media: &domain.MediaAsset{
						ID:        9004,
						PublicURL: "https://img.example.com/group-gallery-1.jpg",
						AltText:   "group gallery 1",
					},
				},
			}, nil
		},
	}
	productMediaRepo := &mockProductMediaRepo{
		listByProductIDFn: func(_ context.Context, productID int64) ([]domain.ProductMediaBinding, error) {
			return []domain.ProductMediaBinding{
				{
					ID:        8101,
					ProductID: productID,
					MediaID:   9001,
					UsageType: domain.MediaUsageTypeGallery,
					SortOrder: 1,
					IsPrimary: true,
					Media: &domain.MediaAsset{
						ID:        9001,
						PublicURL: "https://img.example.com/product-primary.jpg",
						AltText:   "product primary",
					},
				},
			}, nil
		},
	}

	uc := application.NewProductUseCase(prodRepo, groupRepo, &mockCategoryRepo{}, stockRepo).
		AttachMediaRepos(groupMediaRepo, productMediaRepo)
	view, err := uc.GetProductDetail(context.Background(), 1001)
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if view.Group == nil || view.Group.CoverImageURL != "https://img.example.com/group-cover.jpg" {
		t.Fatalf("unexpected group cover image: %+v", view.Group)
	}
	if len(view.GroupMedias) != 3 {
		t.Fatalf("group medias len want 3, got %d", len(view.GroupMedias))
	}
	if len(view.ProductMedias) != 1 {
		t.Fatalf("product medias len want 1, got %d", len(view.ProductMedias))
	}
	if len(view.ResolvedMedias) != 4 {
		t.Fatalf("resolved medias len want 4, got %d", len(view.ResolvedMedias))
	}
	if view.ResolvedMedias[0].ID != 9001 || view.ResolvedMedias[0].ImageURL != "https://img.example.com/product-primary.jpg" {
		t.Fatalf("unexpected first resolved media: %+v", view.ResolvedMedias[0])
	}
	if view.GroupMedias[0].UsageType != domain.MediaUsageTypeCover {
		t.Fatalf("unexpected group media usage type: %+v", view.GroupMedias[0])
	}
}
