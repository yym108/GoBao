package application

import (
	"context"
	"strings"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// ProductUseCase 商品业务编排。
// 依赖三个仓储:商品、类目(创建/更新时校验类目存在)、库存(创建时同步初始化)。
type ProductUseCase struct {
	prodRepo         domain.ProductRepository           // 商品仓储
	groupRepo        domain.ProductGroupRepository      // 商品组仓储(详情页聚合与列表聚合入口)
	catRepo          domain.CategoryRepository          // 类目仓储(校验类目存在)
	stockRepo        domain.StockRepository             // 库存仓储(创建商品时同步创建库存)
	groupMediaRepo   domain.ProductGroupMediaRepository // 商品组图库仓储
	productMediaRepo domain.ProductMediaRepository      // 独立商品图库仓储
}

// ProductView 是 application 层对外暴露的商品视图,含库存数量。
// domain.Product 本身不包含库存,避免领域模型过度膨胀。
type ProductView struct {
	domain.Product       // 嵌入商品领域模型
	StockQuantity  int32 // 当前库存数量(仅 Get 时填充)
	StockVersion   int32 // 当前库存版本(仅后台库存编辑时使用)
}

// NewProductUseCase 构造函数。
//   - prodRepo: 商品仓储实现
//   - catRepo: 类目仓储实现(用于校验类目是否存在)
//   - stockRepo: 库存仓储实现(用于创建商品时初始化库存)
func NewProductUseCase(
	prodRepo domain.ProductRepository,
	groupRepo domain.ProductGroupRepository,
	catRepo domain.CategoryRepository,
	stockRepo domain.StockRepository,
) *ProductUseCase {
	return &ProductUseCase{
		prodRepo:  prodRepo,
		groupRepo: groupRepo,
		catRepo:   catRepo,
		stockRepo: stockRepo,
	}
}

// AttachMediaRepos 为商品详情聚合接入图库仓储。
// 保持构造函数兼容，避免当前调用点一次性全量改签名。
func (uc *ProductUseCase) AttachMediaRepos(groupMediaRepo domain.ProductGroupMediaRepository, productMediaRepo domain.ProductMediaRepository) *ProductUseCase {
	uc.groupMediaRepo = groupMediaRepo
	uc.productMediaRepo = productMediaRepo
	return uc
}

// Create 创建商品。
// 业务规则:
//  1. name 去除首尾空白后非空;
//  2. price >= 0;
//  3. categoryID 对应的类目必须存在;
//  4. 同步创建库存记录(后续 Task 9 的 repo 实现会在同一事务内完成)。
//
// 参数:
//   - ctx: 上下文
//   - p: 商品领域对象(ID 由仓储层回填)
//   - initialStock: 初始库存数量,负值修正为 0
func (uc *ProductUseCase) Create(ctx context.Context, p *domain.Product, initialStock int32) (*ProductView, error) {
	p.Name = strings.TrimSpace(p.Name)
	p.SpecLabel = strings.TrimSpace(p.SpecLabel)
	if p.Name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	if p.Price < 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "price 不能为负数")
	}
	if p.CategoryID <= 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "category_id 无效")
	}
	cat, err := uc.catRepo.FindByID(ctx, p.CategoryID)
	if err != nil {
		return nil, err
	}
	if cat == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "类目不存在")
	}
	if p.GroupID <= 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "group_id 无效")
	}
	group, err := uc.groupRepo.FindByID(ctx, p.GroupID)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组不存在")
	}
	if err := uc.prodRepo.Create(ctx, p); err != nil {
		return nil, err
	}
	if initialStock < 0 {
		initialStock = 0
	}
	stock := &domain.Stock{ProductID: p.ID, Quantity: initialStock}
	if err := uc.stockRepo.Create(ctx, stock); err != nil {
		return nil, err
	}
	return &ProductView{Product: *p, StockQuantity: stock.Quantity, StockVersion: stock.Version}, nil
}

// Get 按 ID 查询商品,并携带当前库存数量。
//   - ctx: 上下文
//   - id: 商品主键
func (uc *ProductUseCase) Get(ctx context.Context, id int64) (*ProductView, error) {
	p, err := uc.prodRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	view := &ProductView{Product: *p}
	stock, err := uc.stockRepo.FindByProductID(ctx, id)
	if err != nil {
		return nil, err
	}
	if stock != nil {
		view.StockQuantity = stock.Quantity
		view.StockVersion = stock.Version
	}
	return view, nil
}

// GetProductDetail 查询商品详情页所需的完整信息，包括当前商品、所属商品组和同组版本。
// List 分页查询商品列表。返回的商品视图不包含库存数量(列表页不展示库存)。
// 参数:
//   - ctx: 上下文
//   - categoryID: 类目 ID,0 表示不过滤
//   - page: 页码,从 1 开始;<=0 修正为 1
//   - pageSize: 每页大小;<=0 修正为 20,>100 截到 100
func (uc *ProductUseCase) List(ctx context.Context, categoryID int64, page, pageSize int) ([]*domain.Product, int64, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}
	items, total, err := uc.prodRepo.List(ctx, categoryID, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	if uc.groupRepo == nil {
		return items, total, nil
	}

	/**
	 * 商品列表卡片需要优先展示商品组封面图。
	 * 这里在应用层完成一次轻量聚合，避免让前端再为每个商品入口额外请求详情接口。
	 */
	groupCache := make(map[int64]*domain.ProductGroup)
	for _, item := range items {
		if item == nil || item.GroupID <= 0 {
			continue
		}
		group, ok := groupCache[item.GroupID]
		if !ok {
			group, err = uc.groupRepo.FindByID(ctx, item.GroupID)
			if err != nil {
				return nil, 0, err
			}
			groupCache[item.GroupID] = group
		}
		if group != nil {
			item.CoverImageURL = group.CoverImageURL
		}
	}

	return items, total, nil
}

// Update 更新商品。categoryID 变更时需校验新类目存在。
// 参数:
//   - ctx: 上下文
//   - id: 商品主键
//   - update: 包含待更新字段的商品对象(Name/Description/Price/CategoryID/ImageURL/Status)
func (uc *ProductUseCase) Update(ctx context.Context, id int64, update *domain.Product) (*ProductView, error) {
	if update.Name = strings.TrimSpace(update.Name); update.Name == "" {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "name 不能为空")
	}
	update.SpecLabel = strings.TrimSpace(update.SpecLabel)
	if update.Price < 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "price 不能为负数")
	}
	p, err := uc.prodRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	if update.GroupID <= 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "group_id 无效")
	}
	if update.GroupID != p.GroupID {
		group, err := uc.groupRepo.FindByID(ctx, update.GroupID)
		if err != nil {
			return nil, err
		}
		if group == nil {
			return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组不存在")
		}
		p.GroupID = update.GroupID
	}
	if update.CategoryID != p.CategoryID {
		if update.CategoryID <= 0 {
			return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "category_id 无效")
		}
		cat, err := uc.catRepo.FindByID(ctx, update.CategoryID)
		if err != nil {
			return nil, err
		}
		if cat == nil {
			return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "类目不存在")
		}
		p.CategoryID = update.CategoryID
	}
	p.Name = update.Name
	p.Description = update.Description
	p.Price = update.Price
	p.ImageURL = update.ImageURL
	p.Status = update.Status
	p.SpecLabel = update.SpecLabel
	p.SpecValuesJSON = update.SpecValuesJSON
	p.SortOrder = update.SortOrder
	if err := uc.prodRepo.Update(ctx, p); err != nil {
		return nil, err
	}
	stock, err := uc.stockRepo.FindByProductID(ctx, id)
	if err != nil {
		return nil, err
	}
	view := &ProductView{Product: *p}
	if stock != nil {
		view.StockQuantity = stock.Quantity
		view.StockVersion = stock.Version
	}
	return view, nil
}

// SoftDelete 软删除商品。
//   - ctx: 上下文
//   - id: 商品主键
func (uc *ProductUseCase) SoftDelete(ctx context.Context, id int64) error {
	p, err := uc.prodRepo.FindByID(ctx, id)
	if err != nil {
		return err
	}
	if p == nil {
		return pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	return uc.prodRepo.SoftDelete(ctx, id)
}
