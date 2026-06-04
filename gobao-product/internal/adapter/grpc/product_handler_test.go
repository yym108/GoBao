package grpc

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
	productv1 "github.com/yym108/gobao-proto/gen/go/gobao/product/v1"
)

// ==================== mock 仓储 ====================

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

// mockCategoryRepo 用 function fields 实现 CategoryRepository。
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

// mockSeckillRedisStore 用 function fields 实现 SeckillRedisStore。
type mockSeckillRedisStore struct {
	setFn func(ctx context.Context, key string, value any, ttl time.Duration) error
}

func (m *mockSeckillRedisStore) Set(ctx context.Context, key string, value any, ttl time.Duration) error {
	return m.setFn(ctx, key, value, ttl)
}

// ==================== bufconn 辅助 ====================

// testEnv 封装 bufconn 环境,持有 mock 仓储以便测试灵活配置。
type testEnv struct {
	client      productv1.ProductServiceClient
	prodRepo    *mockProductRepo
	groupRepo   *mockProductGroupRepo
	catRepo     *mockCategoryRepo
	stockRepo   *mockStockRepo
	seckillRepo *mockSeckillActivityRepo
	seckillRDB  *mockSeckillRedisStore
}

// setupBufconn 创建 bufconn 内存网络,注入 mock 仓储,返回 gRPC 客户端和 mock 引用。
func setupBufconn(t *testing.T) *testEnv {
	t.Helper()

	prodRepo := &mockProductRepo{}
	groupRepo := &mockProductGroupRepo{}
	catRepo := &mockCategoryRepo{}
	stockRepo := &mockStockRepo{}
	seckillRepo := &mockSeckillActivityRepo{}
	seckillRDB := &mockSeckillRedisStore{
		setFn: func(_ context.Context, _ string, _ any, _ time.Duration) error { return nil },
	}

	prodUC := application.NewProductUseCase(prodRepo, groupRepo, catRepo, stockRepo)
	groupUC := application.NewProductGroupUseCase(groupRepo, catRepo)
	catUC := application.NewCategoryUseCase(catRepo, groupRepo)
	stockUC := application.NewStockUseCase(prodRepo, stockRepo)
	seckillUC := application.NewSeckillUseCase(prodRepo, seckillRepo, seckillRDB)
	handler := NewProductHandler(prodUC, groupUC, catUC, stockUC, seckillUC)

	lis := bufconn.Listen(1024 * 1024)
	srv := grpc.NewServer()
	productv1.RegisterProductServiceServer(srv, handler)
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(func() { srv.Stop() })

	conn, err := grpc.NewClient("passthrough:///bufconn",
		grpc.WithContextDialer(func(_ context.Context, _ string) (net.Conn, error) {
			return lis.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })

	return &testEnv{
		client:      productv1.NewProductServiceClient(conn),
		prodRepo:    prodRepo,
		groupRepo:   groupRepo,
		catRepo:     catRepo,
		stockRepo:   stockRepo,
		seckillRepo: seckillRepo,
		seckillRDB:  seckillRDB,
	}
}

// ==================== 商品测试 ====================

// TestCreateProduct_Success 创建商品成功。
func TestCreateProduct_Success(t *testing.T) {
	env := setupBufconn(t)
	env.catRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Category, error) {
		return &domain.Category{ID: id, Name: "电子产品"}, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
		return &domain.ProductGroup{ID: id, Name: "MacBook Air"}, nil
	}
	env.prodRepo.createFn = func(_ context.Context, p *domain.Product) error {
		assert.Equal(t, int64(2001), p.GroupID)
		assert.Equal(t, "16GB / 512GB", p.SpecLabel)
		assert.Equal(t, `{"ram":"16GB","storage":"512GB"}`, p.SpecValuesJSON)
		assert.Equal(t, int32(2), p.SortOrder)
		assert.Equal(t, int32(2), p.Status)
		p.ID = 10
		return nil
	}
	env.stockRepo.createFn = func(_ context.Context, s *domain.Stock) error {
		s.ID = 1
		return nil
	}

	resp, err := env.client.CreateProduct(context.Background(), &productv1.CreateProductRequest{
		Name: "iPhone", Price: 99900, CategoryId: 1, InitialStock: 100,
		GroupId: 2001, SpecLabel: "16GB / 512GB", SpecValuesJson: `{"ram":"16GB","storage":"512GB"}`, SortOrder: 2, Status: 2,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(10), resp.GetProduct().GetId())
	assert.Equal(t, "iPhone", resp.GetProduct().GetName())
	assert.Equal(t, int64(2001), resp.GetProduct().GetGroupId())
	assert.Equal(t, "16GB / 512GB", resp.GetProduct().GetSpecLabel())
}

// TestCreateProduct_EmptyName 创建商品名称为空返回 InvalidArgument。
func TestCreateProduct_EmptyName(t *testing.T) {
	env := setupBufconn(t)
	_, err := env.client.CreateProduct(context.Background(), &productv1.CreateProductRequest{
		Name: "", Price: 100, CategoryId: 1,
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestGetProduct_Success 查询商品成功,包含库存数量。
func TestGetProduct_Success(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return &domain.Product{ID: id, GroupID: 10, Name: "Book", Price: 5000, CategoryID: 1, Status: 1}, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
		return &domain.ProductGroup{ID: id, Name: "Book 系列", CategoryID: 1, Status: 1}, nil
	}
	env.groupRepo.listProductsByGroupIDFn = func(_ context.Context, groupID int64) ([]*domain.Product, error) {
		return []*domain.Product{
			{ID: 1, GroupID: groupID, Name: "Book", Price: 5000, CategoryID: 1, Status: 1},
		}, nil
	}
	env.stockRepo.findByProductIDFn = func(_ context.Context, productID int64) (*domain.Stock, error) {
		return &domain.Stock{ProductID: productID, Quantity: 42, Version: 3}, nil
	}

	resp, err := env.client.GetProduct(context.Background(), &productv1.GetProductRequest{Id: 1})
	require.NoError(t, err)
	assert.Equal(t, "Book", resp.GetProduct().GetName())
	assert.Equal(t, int32(42), resp.GetProduct().GetStockQuantity())
	assert.Equal(t, int32(3), resp.GetProduct().GetStockVersion())
}

func TestUpdateProduct_Success(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return &domain.Product{ID: id, Name: "旧商品", CategoryID: 1, GroupID: 10, Status: 1}, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
		return &domain.ProductGroup{ID: id, Name: "商品组"}, nil
	}
	env.catRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Category, error) {
		return &domain.Category{ID: id, Name: "电子产品"}, nil
	}
	env.prodRepo.updateFn = func(_ context.Context, p *domain.Product) error {
		assert.Equal(t, int64(12), p.GroupID)
		assert.Equal(t, "18GB / 1TB", p.SpecLabel)
		assert.Equal(t, `{"ram":"18GB","storage":"1TB"}`, p.SpecValuesJSON)
		assert.Equal(t, int32(4), p.SortOrder)
		return nil
	}
	env.stockRepo.findByProductIDFn = func(_ context.Context, productID int64) (*domain.Stock, error) {
		return &domain.Stock{ProductID: productID, Quantity: 9, Version: 6}, nil
	}

	resp, err := env.client.UpdateProduct(context.Background(), &productv1.UpdateProductRequest{
		Id: 10, Name: "新商品", Description: "新描述", Price: 1299900, CategoryId: 2, ImageUrl: "/images/10.jpg",
		Status: 1, GroupId: 12, SpecLabel: "18GB / 1TB", SpecValuesJson: `{"ram":"18GB","storage":"1TB"}`, SortOrder: 4,
	})
	require.NoError(t, err)
	assert.Equal(t, "新商品", resp.GetProduct().GetName())
	assert.Equal(t, int64(12), resp.GetProduct().GetGroupId())
	assert.Equal(t, "18GB / 1TB", resp.GetProduct().GetSpecLabel())
	assert.Equal(t, int32(6), resp.GetProduct().GetStockVersion())
}

// TestProductHandler_GetProduct_WithVariants 查询商品详情时返回商品组与同组版本结构。
func TestProductHandler_GetProduct_WithVariants(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return &domain.Product{
			ID:         id,
			GroupID:    10,
			Name:       "MacBook Air 13",
			Price:      899900,
			CategoryID: 1,
			SpecLabel:  "16GB / 256GB",
			ImageURL:   "https://example.com/macbook-air-256.png",
			Status:     1,
			SortOrder:  1,
		}, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
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
	}
	env.groupRepo.listProductsByGroupIDFn = func(_ context.Context, groupID int64) ([]*domain.Product, error) {
		return []*domain.Product{
			{
				ID:         1001,
				GroupID:    groupID,
				Name:       "MacBook Air 13",
				Price:      899900,
				CategoryID: 1,
				SpecLabel:  "16GB / 256GB",
				ImageURL:   "https://example.com/macbook-air-256.png",
				Status:     1,
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
				Status:     1,
				SortOrder:  2,
			},
		}, nil
	}
	env.stockRepo.findByProductIDFn = func(_ context.Context, productID int64) (*domain.Stock, error) {
		switch productID {
		case 1, 1001:
			return &domain.Stock{ProductID: productID, Quantity: 0}, nil
		case 1002:
			return &domain.Stock{ProductID: productID, Quantity: 6}, nil
		default:
			return nil, nil
		}
	}

	resp, err := env.client.GetProduct(context.Background(), &productv1.GetProductRequest{Id: 1})
	require.NoError(t, err)
	assert.Equal(t, "MacBook Air 13", resp.GetProduct().GetName())
	assert.Equal(t, "16GB / 256GB", resp.GetProduct().GetSpecLabel())
	assert.NotNil(t, resp.GetGroup())
	assert.Equal(t, int64(10), resp.GetGroup().GetId())
	assert.Equal(t, "MacBook Air 13", resp.GetGroup().GetName())
	assert.Len(t, resp.GetVariants(), 2)
	assert.Equal(t, int64(1002), resp.GetDefaultProductId())
	assert.Equal(t, int64(1002), resp.GetVariants()[1].GetId())
	assert.Equal(t, int64(1099900), resp.GetVariants()[1].GetPrice())
	assert.Equal(t, "16GB / 512GB", resp.GetVariants()[1].GetSpecLabel())
}

// TestProductHandler_GetProduct_WithMediaGallery 查询商品详情时返回媒体图库结构。
func TestProductHandler_GetProduct_WithMediaGallery(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return &domain.Product{
			ID:         id,
			GroupID:    10,
			Name:       "MacBook Air 13",
			Price:      899900,
			CategoryID: 1,
			SpecLabel:  "16GB / 256GB",
			ImageURL:   "https://img.example.com/product-primary.jpg",
			Status:     1,
			SortOrder:  1,
		}, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
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
	}
	env.groupRepo.listProductsByGroupIDFn = func(_ context.Context, groupID int64) ([]*domain.Product, error) {
		return []*domain.Product{
			{
				ID:         1001,
				GroupID:    groupID,
				Name:       "MacBook Air 13",
				Price:      899900,
				CategoryID: 1,
				SpecLabel:  "16GB / 256GB",
				ImageURL:   "https://img.example.com/product-primary.jpg",
				Status:     1,
				SortOrder:  1,
			},
		}, nil
	}
	env.stockRepo.findByProductIDFn = func(_ context.Context, productID int64) (*domain.Stock, error) {
		return &domain.Stock{ProductID: productID, Quantity: 6}, nil
	}

	resp, err := env.client.GetProduct(context.Background(), &productv1.GetProductRequest{Id: 1001})
	require.NoError(t, err)
	assert.NotNil(t, resp.GetGroup())
	assert.Len(t, resp.GetGroupMedias(), 2)
	assert.Len(t, resp.GetProductMedias(), 1)
	assert.Len(t, resp.GetResolvedMedias(), 3)
	assert.Equal(t, "https://img.example.com/group-cover.jpg", resp.GetGroup().GetCoverImageUrl())
	assert.Equal(t, int64(9001), resp.GetResolvedMedias()[0].GetId())
	assert.Equal(t, "https://img.example.com/product-primary.jpg", resp.GetResolvedMedias()[0].GetImageUrl())
}

// TestGetProduct_NotFound 查询不存在的商品返回 NotFound。
func TestGetProduct_NotFound(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return nil, nil
	}

	_, err := env.client.GetProduct(context.Background(), &productv1.GetProductRequest{Id: 999})
	require.Error(t, err)
	assert.Equal(t, codes.NotFound, status.Code(err))
}

// TestListProducts_Success 分页查询商品列表。
func TestListProducts_Success(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.listFn = func(_ context.Context, catID int64, page, size int) ([]*domain.Product, int64, error) {
		return []*domain.Product{
			{ID: 1, GroupID: 11, Name: "A"},
			{ID: 2, GroupID: 12, Name: "B"},
		}, 2, nil
	}
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
		return &domain.ProductGroup{
			ID:            id,
			Name:          "系列",
			CoverImageURL: "https://img.example.com/group-cover.jpg",
		}, nil
	}

	resp, err := env.client.ListProducts(context.Background(), &productv1.ListProductsRequest{Page: 1, PageSize: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(2), resp.GetTotal())
	assert.Len(t, resp.GetItems(), 2)
	assert.Equal(t, "https://img.example.com/group-cover.jpg", resp.GetItems()[0].GetCoverImageUrl())
}

// TestDeleteProduct_InvalidID 删除商品 ID 无效返回 InvalidArgument。
func TestDeleteProduct_InvalidID(t *testing.T) {
	env := setupBufconn(t)
	_, err := env.client.DeleteProduct(context.Background(), &productv1.DeleteProductRequest{Id: 0})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// ==================== 类目测试 ====================

func TestCreateProductGroup_Success(t *testing.T) {
	env := setupBufconn(t)
	env.catRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Category, error) {
		return &domain.Category{ID: id, Name: "Mac"}, nil
	}
	env.groupRepo.existsBySlugFn = func(_ context.Context, slug string, excludeID int64) (bool, error) {
		return false, nil
	}
	env.groupRepo.createFn = func(_ context.Context, group *domain.ProductGroup) error {
		group.ID = 5001
		return nil
	}

	resp, err := env.client.CreateProductGroup(context.Background(), &productv1.CreateProductGroupRequest{
		Name: "MacBook Air", Slug: "macbook-air", CategoryId: 2, Status: 1, SortOrder: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5001), resp.GetGroup().GetId())
	assert.Equal(t, "macbook-air", resp.GetGroup().GetSlug())
}

func TestListProductGroups_Success(t *testing.T) {
	env := setupBufconn(t)
	env.groupRepo.listFn = func(_ context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error) {
		return []domain.ProductGroup{
			{ID: 5001, Name: "MacBook Air", Slug: "macbook-air", CategoryID: 2, Status: 1, SortOrder: 1},
			{ID: 5002, Name: "MacBook Pro", Slug: "macbook-pro", CategoryID: 2, Status: 1, SortOrder: 2},
		}, 2, nil
	}

	resp, err := env.client.ListProductGroups(context.Background(), &productv1.ListProductGroupsRequest{CategoryId: 2, Page: 1, PageSize: 20})
	require.NoError(t, err)
	assert.Equal(t, int64(2), resp.GetTotal())
	assert.Len(t, resp.GetItems(), 2)
}

func TestDeleteProductGroup_WithProducts(t *testing.T) {
	env := setupBufconn(t)
	env.groupRepo.findByIDFn = func(_ context.Context, id int64) (*domain.ProductGroup, error) {
		return &domain.ProductGroup{ID: id, Name: "MacBook Air"}, nil
	}
	env.groupRepo.countProductsByGroupIDFn = func(_ context.Context, groupID int64) (int64, error) {
		return 1, nil
	}

	_, err := env.client.DeleteProductGroup(context.Background(), &productv1.DeleteProductGroupRequest{Id: 5001})
	require.Error(t, err)
	assert.Equal(t, codes.FailedPrecondition, status.Code(err))
}

// TestCreateCategory_Success 创建类目成功。
func TestCreateCategory_Success(t *testing.T) {
	env := setupBufconn(t)
	env.catRepo.existsByNameFn = func(_ context.Context, name string, excludeID int64) (bool, error) {
		return false, nil
	}
	env.catRepo.createFn = func(_ context.Context, c *domain.Category) error {
		c.ID = 5
		return nil
	}

	resp, err := env.client.CreateCategory(context.Background(), &productv1.CreateCategoryRequest{
		Name: "电子产品", SortOrder: 1,
	})
	require.NoError(t, err)
	assert.Equal(t, int64(5), resp.GetCategory().GetId())
}

// TestCreateCategory_EmptyName 类目名称为空返回 InvalidArgument。
func TestCreateCategory_EmptyName(t *testing.T) {
	env := setupBufconn(t)
	_, err := env.client.CreateCategory(context.Background(), &productv1.CreateCategoryRequest{
		Name: "",
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestDeleteCategory_Success 删除类目时会先清空关联商品组类目。
func TestDeleteCategory_Success(t *testing.T) {
	env := setupBufconn(t)
	clearedCategoryID := int64(0)
	env.catRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Category, error) {
		return &domain.Category{ID: id}, nil
	}
	env.groupRepo.clearCategoryByIDFn = func(_ context.Context, categoryID int64) error {
		clearedCategoryID = categoryID
		return nil
	}
	env.catRepo.deleteFn = func(_ context.Context, id int64) error {
		assert.Equal(t, int64(1), id)
		return nil
	}

	_, err := env.client.DeleteCategory(context.Background(), &productv1.DeleteCategoryRequest{Id: 1})
	require.NoError(t, err)
	assert.Equal(t, int64(1), clearedCategoryID)
}

// ==================== 库存测试 ====================

// TestDeductStock_Success 扣减库存成功。
func TestDeductStock_Success(t *testing.T) {
	env := setupBufconn(t)
	env.stockRepo.deductFn = func(_ context.Context, productID int64, qty int32) (int32, error) {
		assert.Equal(t, int64(1001002), productID)
		assert.Equal(t, int32(30), qty)
		return 70, nil
	}

	resp, err := env.client.DeductStock(context.Background(), &productv1.DeductStockRequest{
		ProductId: 1001002, Quantity: 30,
	})
	require.NoError(t, err)
	assert.Equal(t, int32(70), resp.GetRemaining())
}

// TestDeductStock_CASConflict CAS 冲突返回 Aborted。
func TestDeductStock_CASConflict(t *testing.T) {
	env := setupBufconn(t)
	env.stockRepo.deductFn = func(_ context.Context, productID int64, qty int32) (int32, error) {
		assert.Equal(t, int64(1001002), productID)
		assert.Equal(t, int32(10), qty)
		return 0, domain.ErrStockCASConflict
	}

	_, err := env.client.DeductStock(context.Background(), &productv1.DeductStockRequest{
		ProductId: 1001002, Quantity: 10,
	})
	require.Error(t, err)
	assert.Equal(t, codes.Aborted, status.Code(err))
}

// TestRestoreStock_Success 回补库存成功。
func TestRestoreStock_Success(t *testing.T) {
	env := setupBufconn(t)
	env.stockRepo.restoreFn = func(_ context.Context, productID int64, qty int32) (int32, error) {
		assert.Equal(t, int64(1001002), productID)
		assert.Equal(t, int32(10), qty)
		return 80, nil
	}

	resp, err := env.client.RestoreStock(context.Background(), &productv1.RestoreStockRequest{
		ProductId: 1001002, Quantity: 10,
	})
	require.NoError(t, err)
	assert.Equal(t, int32(80), resp.GetRemaining())
}

// TestUpdateStock_Success 直接设置库存成功。
func TestUpdateStock_Success(t *testing.T) {
	env := setupBufconn(t)
	env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
		return &domain.Product{ID: id}, nil
	}
	env.stockRepo.setQuantityFn = func(_ context.Context, productID int64, qty int32, expectedVersion int32) error {
		return nil
	}

	resp, err := env.client.UpdateStock(context.Background(), &productv1.UpdateStockRequest{
		ProductId: 1, Quantity: 200, ExpectedVersion: 3,
	})
	require.NoError(t, err)
	assert.Equal(t, int32(200), resp.GetStockQuantity())
	assert.Equal(t, int32(4), resp.GetVersion())
}

// TestUpdateStock_InvalidProductID product_id 无效返回 InvalidArgument。
func TestUpdateStock_InvalidProductID(t *testing.T) {
	env := setupBufconn(t)
	_, err := env.client.UpdateStock(context.Background(), &productv1.UpdateStockRequest{
		ProductId: 0, Quantity: 100,
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// TestDeductStock_InvalidQuantity quantity <= 0 返回 InvalidArgument。
func TestDeductStock_InvalidQuantity(t *testing.T) {
	env := setupBufconn(t)
	_, err := env.client.DeductStock(context.Background(), &productv1.DeductStockRequest{
		ProductId: 1001002, Quantity: 0,
	})
	require.Error(t, err)
	assert.Equal(t, codes.InvalidArgument, status.Code(err))
}

// ==================== 秒杀测试 ====================

// TestGetSeckillActivity_Success 查询秒杀活动成功。
func TestGetSeckillActivity_Success(t *testing.T) {
	env := setupBufconn(t)
	startAt := int64(1775008800)
	endAt := int64(1775016000)
	env.seckillRepo.findByIDFn = func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
		return &domain.SeckillActivity{
			ID: id, ProductID: 1001, Title: "五一秒杀",
			SeckillPrice: 9900, SeckillStock: 88, Status: domain.SeckillStatusActive,
			StartAt: time.Unix(startAt, 0), EndAt: time.Unix(endAt, 0),
		}, nil
	}

	resp, err := env.client.GetSeckillActivity(context.Background(), &productv1.GetSeckillActivityRequest{Id: 9})
	require.NoError(t, err)
	assert.Equal(t, int64(9), resp.GetActivity().GetId())
	assert.Equal(t, int64(1001), resp.GetActivity().GetProductId())
	assert.Equal(t, "五一秒杀", resp.GetActivity().GetTitle())
	assert.Equal(t, int64(9900), resp.GetActivity().GetSeckillPrice())
	assert.Equal(t, int32(88), resp.GetActivity().GetSeckillStock())
	assert.Equal(t, int32(domain.SeckillStatusActive), resp.GetActivity().GetStatus())
	assert.Equal(t, startAt, resp.GetActivity().GetStartAt())
	assert.Equal(t, endAt, resp.GetActivity().GetEndAt())
}

// TestPrewarmSeckill_StatusMapping 测试预热成功和错误码映射。
func TestPrewarmSeckill_StatusMapping(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		env := setupBufconn(t)
		env.seckillRepo.findByIDFn = func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID: id, ProductID: 11, Title: "预热活动",
				SeckillPrice: 1999, SeckillStock: 20, Status: domain.SeckillStatusActive,
				StartAt: time.Now().Add(-time.Minute), EndAt: time.Now().Add(time.Hour),
			}, nil
		}
		env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "秒杀商品"}, nil
		}

		resp, err := env.client.PrewarmSeckill(context.Background(), &productv1.PrewarmSeckillRequest{Id: 7})
		require.NoError(t, err)
		assert.Equal(t, int64(7), resp.GetActivityId())
		assert.Equal(t, "seckill:activity:7:meta", resp.GetMetaKey())
		assert.Equal(t, "seckill:activity:7:stock", resp.GetStockKey())
	})

	t.Run("not_found", func(t *testing.T) {
		env := setupBufconn(t)
		env.seckillRepo.findByIDFn = func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return nil, nil
		}

		_, err := env.client.PrewarmSeckill(context.Background(), &productv1.PrewarmSeckillRequest{Id: 404})
		require.Error(t, err)
		assert.Equal(t, codes.NotFound, status.Code(err))
	})

	t.Run("inactive", func(t *testing.T) {
		env := setupBufconn(t)
		env.seckillRepo.findByIDFn = func(_ context.Context, id int64) (*domain.SeckillActivity, error) {
			return &domain.SeckillActivity{
				ID: id, ProductID: 12, Title: "未激活活动",
				SeckillPrice: 2999, SeckillStock: 10, Status: domain.SeckillStatusDraft,
				StartAt: time.Now().Add(time.Hour), EndAt: time.Now().Add(2 * time.Hour),
			}, nil
		}
		env.prodRepo.findByIDFn = func(_ context.Context, id int64) (*domain.Product, error) {
			return &domain.Product{ID: id, Name: "秒杀商品"}, nil
		}

		_, err := env.client.PrewarmSeckill(context.Background(), &productv1.PrewarmSeckillRequest{Id: 8})
		require.Error(t, err)
		assert.Equal(t, codes.FailedPrecondition, status.Code(err))
	})
}
