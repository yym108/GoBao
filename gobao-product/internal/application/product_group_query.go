package application

import (
	"context"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// ProductVariantView 表示同一商品组下某个独立商品版本的最小展示快照。
// 前端切换版本时只消费后端返回的版本列表，不自行推导价格与库存。
type ProductVariantView struct {
	ID             int64  // 独立商品 ID
	SpecLabel      string // 规格文案
	SpecValuesJSON string // 结构化规格 JSON
	ImageURL       string // 版本主图
	Price          int64  // 当前售价
	StockQuantity  int32  // 当前库存
	Status         int32  // 上下架状态
}

// ProductMediaView 表示一张可以直接给前端渲染的商品图片。
// 该结构已经由后端完成排序与主图决策，前端只负责展示。
type ProductMediaView struct {
	ID        int64  // 图片资源 ID
	ImageURL  string // 图片地址
	AltText   string // 替代文本
	SortOrder int32  // 排序权重
	IsPrimary bool   // 是否主图
	BindingID int64  // 绑定记录 ID，仅后台删除绑定时使用
	UsageType string // 图片用途：cover/hero/gallery
}

// ProductGroupDetailView 是新商品详情页的后端聚合视图。
// 它一次性返回当前商品、所属商品组和同组可切换版本列表，作为 Apple 式同页切版本的后端真值。
type ProductGroupDetailView struct {
	Group            *domain.ProductGroup // 当前商品所属商品组
	Product          *ProductView         // 当前选中的独立商品
	Variants         []ProductVariantView // 同组全部可切换版本
	DefaultProductID int64                // 详情页默认选中的独立商品 ID
	GroupMedias      []ProductMediaView   // 商品组公共图库
	ProductMedias    []ProductMediaView   // 当前商品专属图库
	ResolvedMedias   []ProductMediaView   // 后端拼装后的最终图库
}

// GetProductDetail 按商品 ID 查询新的商品详情聚合视图。
// 当前策略：
// 1. 先读取当前独立商品；
// 2. 再读取其所属商品组；
// 3. 最后加载同组商品列表，组装成版本切换列表。
func (uc *ProductUseCase) GetProductDetail(ctx context.Context, productID int64) (*ProductGroupDetailView, error) {
	productView, err := uc.Get(ctx, productID)
	if err != nil {
		return nil, err
	}
	if productView.GroupID <= 0 {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品尚未绑定商品组")
	}

	group, err := uc.groupRepo.FindByID(ctx, productView.GroupID)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品组不存在")
	}

	products, err := uc.groupRepo.ListProductsByGroupID(ctx, productView.GroupID)
	if err != nil {
		return nil, err
	}

	variants := make([]ProductVariantView, 0, len(products))
	for _, item := range products {
		if item == nil {
			continue
		}
		stockQuantity, stockErr := uc.loadProductStockQuantity(ctx, item.ID)
		if stockErr != nil {
			return nil, stockErr
		}
		variants = append(variants, ProductVariantView{
			ID:             item.ID,
			SpecLabel:      item.SpecLabel,
			SpecValuesJSON: item.SpecValuesJSON,
			ImageURL:       item.ImageURL,
			Price:          item.Price,
			StockQuantity:  stockQuantity,
			Status:         item.Status,
		})
	}

	groupMedias, err := uc.loadGroupMedias(ctx, group)
	if err != nil {
		return nil, err
	}
	productMedias, err := uc.loadProductMedias(ctx, productView)
	if err != nil {
		return nil, err
	}
	resolvedMedias := buildResolvedMedias(productView, group, productMedias, groupMedias)

	return &ProductGroupDetailView{
		Group:            group,
		Product:          productView,
		Variants:         variants,
		DefaultProductID: pickDefaultProductID(productID, variants),
		GroupMedias:      groupMedias,
		ProductMedias:    productMedias,
		ResolvedMedias:   resolvedMedias,
	}, nil
}

// loadProductStockQuantity 统一读取独立商品库存。
// 在当前迁移阶段，库存来源仍优先复用 Get 的兼容逻辑，避免此处复制一套双读判断。
func (uc *ProductUseCase) loadProductStockQuantity(ctx context.Context, productID int64) (int32, error) {
	view, err := uc.Get(ctx, productID)
	if err != nil {
		return 0, err
	}
	if view == nil {
		return 0, nil
	}
	return view.StockQuantity, nil
}

// pickDefaultProductID 统一封装默认版本选择逻辑。
// 优先选择第一个可售且有库存版本；若都不可售或无库存，再退化为当前请求商品，最后退化为第一条版本。
func pickDefaultProductID(currentProductID int64, variants []ProductVariantView) int64 {
	for _, item := range variants {
		if item.Status == domain.ProductStatusOnSale && item.StockQuantity > 0 {
			return item.ID
		}
	}
	for _, item := range variants {
		if item.ID == currentProductID {
			return item.ID
		}
	}
	if len(variants) > 0 {
		return variants[0].ID
	}
	return 0
}

// loadGroupMedias 读取商品组下的公共图片绑定。
// 这里返回全部 usage_type，前台可以只消费 gallery，后台则可直接复用同一份真值做 Hero/封面选择。
func (uc *ProductUseCase) loadGroupMedias(ctx context.Context, group *domain.ProductGroup) ([]ProductMediaView, error) {
	if group == nil {
		return nil, nil
	}
	if uc.groupMediaRepo == nil || group.ID <= 0 {
		return buildFallbackGroupMedias(group), nil
	}
	items, err := uc.groupMediaRepo.ListByGroupID(ctx, group.ID)
	if err != nil {
		return nil, err
	}
	out := make([]ProductMediaView, 0, len(items))
	for _, item := range items {
		if item.Media == nil {
			continue
		}
		out = append(out, ProductMediaView{
			ID:        item.Media.ID,
			ImageURL:  item.Media.PublicURL,
			AltText:   item.Media.AltText,
			SortOrder: item.SortOrder,
			IsPrimary: item.IsPrimary,
			BindingID: item.ID,
			UsageType: item.UsageType,
		})
	}
	if len(out) > 0 {
		return out, nil
	}
	return buildFallbackGroupMedias(group), nil
}

// loadProductMedias 读取独立商品的专属差异图片。
func (uc *ProductUseCase) loadProductMedias(ctx context.Context, product *ProductView) ([]ProductMediaView, error) {
	if product == nil {
		return nil, nil
	}
	if uc.productMediaRepo == nil || product.ID <= 0 {
		return buildFallbackProductMedias(product), nil
	}
	items, err := uc.productMediaRepo.ListByProductID(ctx, product.ID)
	if err != nil {
		return nil, err
	}
	out := make([]ProductMediaView, 0, len(items))
	for _, item := range items {
		if item.Media == nil {
			continue
		}
		if item.UsageType != domain.MediaUsageTypeGallery {
			continue
		}
		out = append(out, ProductMediaView{
			ID:        item.Media.ID,
			ImageURL:  item.Media.PublicURL,
			AltText:   item.Media.AltText,
			SortOrder: item.SortOrder,
			IsPrimary: item.IsPrimary,
			BindingID: item.ID,
			UsageType: item.UsageType,
		})
	}
	if len(out) > 0 {
		return out, nil
	}
	return buildFallbackProductMedias(product), nil
}

// buildResolvedMedias 组装最终图库，优先独立商品，再拼接商品组公共图片。
func buildResolvedMedias(product *ProductView, group *domain.ProductGroup, productMedias []ProductMediaView, groupMedias []ProductMediaView) []ProductMediaView {
	resolved := make([]ProductMediaView, 0, len(productMedias)+len(groupMedias)+1)
	if len(productMedias) > 0 {
		resolved = append(resolved, productMedias...)
	}
	if len(resolved) == 0 && product != nil && product.ImageURL != "" {
		resolved = append(resolved, ProductMediaView{
			ID:        9001,
			ImageURL:  product.ImageURL,
			AltText:   product.Name,
			SortOrder: 1,
			IsPrimary: true,
			UsageType: domain.MediaUsageTypeGallery,
		})
	}
	resolved = append(resolved, groupMedias...)
	if len(resolved) == 0 && group != nil {
		switch {
		case group.HeroImageURL != "":
			resolved = append(resolved, ProductMediaView{ID: 9002, ImageURL: group.HeroImageURL, AltText: group.Name, SortOrder: 1, IsPrimary: true, UsageType: domain.MediaUsageTypeHero})
		case group.CoverImageURL != "":
			resolved = append(resolved, ProductMediaView{ID: 9002, ImageURL: group.CoverImageURL, AltText: group.Name, SortOrder: 1, IsPrimary: true, UsageType: domain.MediaUsageTypeCover})
		}
	}
	return resolved
}

// buildFallbackGroupMedias 在未接入真实媒体表之前，基于商品组主数据构造最小公共图库。
func buildFallbackGroupMedias(group *domain.ProductGroup) []ProductMediaView {
	if group == nil {
		return nil
	}
	out := make([]ProductMediaView, 0, 2)
	if group.HeroImageURL != "" {
		out = append(out, ProductMediaView{
			ID:        9002,
			ImageURL:  group.HeroImageURL,
			AltText:   group.HeroTitle,
			SortOrder: 2,
			IsPrimary: false,
			UsageType: domain.MediaUsageTypeHero,
		})
	}
	if group.CoverImageURL != "" && group.CoverImageURL != group.HeroImageURL {
		out = append(out, ProductMediaView{
			ID:        9003,
			ImageURL:  group.CoverImageURL,
			AltText:   group.Name,
			SortOrder: 3,
			IsPrimary: false,
			UsageType: domain.MediaUsageTypeCover,
		})
	}
	return out
}

// buildFallbackProductMedias 在未接入真实媒体表之前，基于商品主图构造最小专属图库。
func buildFallbackProductMedias(product *ProductView) []ProductMediaView {
	if product == nil || product.ImageURL == "" {
		return nil
	}
	return []ProductMediaView{
		{
			ID:        9001,
			ImageURL:  product.ImageURL,
			AltText:   product.Name,
			SortOrder: 1,
			IsPrimary: true,
			UsageType: domain.MediaUsageTypeGallery,
		},
	}
}
