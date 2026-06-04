// Package grpc 提供 Product 服务的 gRPC Handler 实现。
// 职责:入参校验 → 调用 usecase → 领域对象转 proto 响应 → 错误码映射 gRPC status。
package grpc

import (
	"context"
	"net/http"
	"path"
	"strings"

	"github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/application"
	"github.com/yym108/gobao-product/internal/domain"
	productv1 "github.com/yym108/gobao-proto/gen/go/gobao/product/v1"
)

// ProductHandler 实现 proto 生成的 ProductServiceServer 接口。
// 嵌入 UnimplementedProductServiceServer 确保向前兼容（proto 新增 RPC 不会编译失败）。
type ProductHandler struct {
	productv1.UnimplementedProductServiceServer                                  // 向前兼容嵌入
	prodUC                                      *application.ProductUseCase      // 商品用例
	groupUC                                     *application.ProductGroupUseCase // 商品组用例
	catUC                                       *application.CategoryUseCase     // 类目用例
	stockUC                                     *application.StockUseCase        // 库存用例
	seckillUC                                   *application.SeckillUseCase      // 秒杀活动用例
	mediaAdminUC                                *application.MediaAdminUseCase   // 媒体后台用例
}

// NewProductHandler 构造 gRPC Handler。
//   - prodUC: 商品用例编排器
//   - catUC: 类目用例编排器
//   - stockUC: 库存用例编排器
//   - seckillUC: 秒杀活动用例编排器
func NewProductHandler(
	prodUC *application.ProductUseCase,
	groupUC *application.ProductGroupUseCase,
	catUC *application.CategoryUseCase,
	stockUC *application.StockUseCase,
	seckillUC *application.SeckillUseCase,
) *ProductHandler {
	return &ProductHandler{
		prodUC: prodUC, groupUC: groupUC, catUC: catUC, stockUC: stockUC, seckillUC: seckillUC,
	}
}

// AttachMediaAdmin 以链式方式为 Handler 注入后台媒体管理用例。
func (h *ProductHandler) AttachMediaAdmin(mediaAdminUC *application.MediaAdminUseCase) *ProductHandler {
	h.mediaAdminUC = mediaAdminUC
	return h
}

// ==================== 商品 ====================

// CreateProduct 创建商品 RPC。
// 入参校验：name 非空、price >= 0。
func (h *ProductHandler) CreateProduct(ctx context.Context, req *productv1.CreateProductRequest) (*productv1.CreateProductResponse, error) {
	if req.GetName() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "name 不能为空")).Err()
	}
	if req.GetPrice() < 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "price 不能为负数")).Err()
	}

	p := &domain.Product{
		Name:           req.GetName(),
		Description:    req.GetDescription(),
		Price:          req.GetPrice(),
		CategoryID:     req.GetCategoryId(),
		GroupID:        req.GetGroupId(),
		SpecLabel:      req.GetSpecLabel(),
		SpecValuesJSON: req.GetSpecValuesJson(),
		ImageURL:       req.GetImageUrl(),
		SortOrder:      req.GetSortOrder(),
		Status:         req.GetStatus(),
	}
	if p.Status == 0 {
		p.Status = domain.ProductStatusOnSale
	}
	view, err := h.prodUC.Create(ctx, p, req.GetInitialStock())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.CreateProductResponse{Product: productViewToProto(view)}, nil
}

// GetProduct 按 ID 查询商品 RPC。
func (h *ProductHandler) GetProduct(ctx context.Context, req *productv1.GetProductRequest) (*productv1.GetProductResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	view, err := h.prodUC.GetProductDetail(ctx, req.GetId())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.GetProductResponse{
		Product:          productViewToProto(view.Product),
		Group:            productGroupToProto(view.Group),
		Variants:         productVariantsToProto(view.Variants),
		DefaultProductId: view.DefaultProductID,
		GroupMedias:      productMediasToProto(view.GroupMedias),
		ProductMedias:    productMediasToProto(view.ProductMedias),
		ResolvedMedias:   productMediasToProto(view.ResolvedMedias),
	}, nil
}

// ListProducts 分页查询商品列表 RPC。
func (h *ProductHandler) ListProducts(ctx context.Context, req *productv1.ListProductsRequest) (*productv1.ListProductsResponse, error) {
	items, total, err := h.prodUC.List(ctx, req.GetCategoryId(), int(req.GetPage()), int(req.GetPageSize()))
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	pbItems := make([]*productv1.Product, 0, len(items))
	for _, item := range items {
		pbItems = append(pbItems, productToProto(item))
	}
	return &productv1.ListProductsResponse{Items: pbItems, Total: total}, nil
}

// UpdateProduct 更新商品 RPC。
func (h *ProductHandler) UpdateProduct(ctx context.Context, req *productv1.UpdateProductRequest) (*productv1.UpdateProductResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	update := &domain.Product{
		Name:           req.GetName(),
		Description:    req.GetDescription(),
		Price:          req.GetPrice(),
		CategoryID:     req.GetCategoryId(),
		GroupID:        req.GetGroupId(),
		SpecLabel:      req.GetSpecLabel(),
		SpecValuesJSON: req.GetSpecValuesJson(),
		ImageURL:       req.GetImageUrl(),
		SortOrder:      req.GetSortOrder(),
		Status:         req.GetStatus(),
	}
	view, err := h.prodUC.Update(ctx, req.GetId(), update)
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateProductResponse{Product: productViewToProto(view)}, nil
}

// DeleteProduct 软删除商品 RPC。
func (h *ProductHandler) DeleteProduct(ctx context.Context, req *productv1.DeleteProductRequest) (*productv1.DeleteProductResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	if err := h.prodUC.SoftDelete(ctx, req.GetId()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeleteProductResponse{}, nil
}

// ==================== 商品组 ====================

// CreateProductGroup 创建商品组 RPC。
func (h *ProductHandler) CreateProductGroup(ctx context.Context, req *productv1.CreateProductGroupRequest) (*productv1.CreateProductGroupResponse, error) {
	group := &domain.ProductGroup{
		Name:          req.GetName(),
		Slug:          req.GetSlug(),
		HeroTitle:     req.GetHeroTitle(),
		HeroSubtitle:  req.GetHeroSubtitle(),
		HeroImageURL:  req.GetHeroImageUrl(),
		CoverImageURL: req.GetCoverImageUrl(),
		CategoryID:    req.GetCategoryId(),
		Status:        req.GetStatus(),
		SortOrder:     req.GetSortOrder(),
		SpecKeys:      req.GetSpecKeys(),
	}
	created, err := h.groupUC.Create(ctx, group)
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.CreateProductGroupResponse{Group: productGroupToProto(created)}, nil
}

// ListProductGroups 分页查询商品组 RPC。
func (h *ProductHandler) ListProductGroups(ctx context.Context, req *productv1.ListProductGroupsRequest) (*productv1.ListProductGroupsResponse, error) {
	items, total, err := h.groupUC.List(ctx, req.GetCategoryId(), int(req.GetPage()), int(req.GetPageSize()))
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	respItems := make([]*productv1.ProductGroup, 0, len(items))
	for idx := range items {
		item := items[idx]
		respItems = append(respItems, productGroupToProto(&item))
	}
	return &productv1.ListProductGroupsResponse{Items: respItems, Total: total}, nil
}

// UpdateProductGroup 更新商品组 RPC。
func (h *ProductHandler) UpdateProductGroup(ctx context.Context, req *productv1.UpdateProductGroupRequest) (*productv1.UpdateProductGroupResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	group := &domain.ProductGroup{
		Name:          req.GetName(),
		Slug:          req.GetSlug(),
		HeroTitle:     req.GetHeroTitle(),
		HeroSubtitle:  req.GetHeroSubtitle(),
		HeroImageURL:  req.GetHeroImageUrl(),
		CoverImageURL: req.GetCoverImageUrl(),
		CategoryID:    req.GetCategoryId(),
		Status:        req.GetStatus(),
		SortOrder:     req.GetSortOrder(),
		SpecKeys:      req.GetSpecKeys(),
	}
	updated, err := h.groupUC.Update(ctx, req.GetId(), group)
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateProductGroupResponse{Group: productGroupToProto(updated)}, nil
}

// DeleteProductGroup 删除商品组 RPC。
func (h *ProductHandler) DeleteProductGroup(ctx context.Context, req *productv1.DeleteProductGroupRequest) (*productv1.DeleteProductGroupResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	if err := h.groupUC.Delete(ctx, req.GetId()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeleteProductGroupResponse{}, nil
}

// ==================== 类目 ====================

// CreateCategory 创建类目 RPC。
func (h *ProductHandler) CreateCategory(ctx context.Context, req *productv1.CreateCategoryRequest) (*productv1.CreateCategoryResponse, error) {
	if req.GetName() == "" {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "name 不能为空")).Err()
	}
	cat, err := h.catUC.Create(ctx, req.GetName(), req.GetSortOrder())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.CreateCategoryResponse{Category: categoryToProto(cat)}, nil
}

// ListCategories 全量查询类目列表 RPC。
func (h *ProductHandler) ListCategories(ctx context.Context, _ *productv1.ListCategoriesRequest) (*productv1.ListCategoriesResponse, error) {
	cats, err := h.catUC.List(ctx)
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	pbCats := make([]*productv1.Category, 0, len(cats))
	for _, c := range cats {
		pbCats = append(pbCats, categoryToProto(c))
	}
	return &productv1.ListCategoriesResponse{Items: pbCats}, nil
}

// UpdateCategory 更新类目 RPC。
func (h *ProductHandler) UpdateCategory(ctx context.Context, req *productv1.UpdateCategoryRequest) (*productv1.UpdateCategoryResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	cat, err := h.catUC.Update(ctx, req.GetId(), req.GetName(), req.GetSortOrder())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateCategoryResponse{Category: categoryToProto(cat)}, nil
}

// DeleteCategory 删除类目 RPC。
func (h *ProductHandler) DeleteCategory(ctx context.Context, req *productv1.DeleteCategoryRequest) (*productv1.DeleteCategoryResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	if err := h.catUC.Delete(ctx, req.GetId()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeleteCategoryResponse{}, nil
}

// ==================== 库存 ====================

// UpdateStock 直接设置库存数量 RPC（商家后台）。
func (h *ProductHandler) UpdateStock(ctx context.Context, req *productv1.UpdateStockRequest) (*productv1.UpdateStockResponse, error) {
	if req.GetProductId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "product_id 必须为正数")).Err()
	}
	if req.GetQuantity() < 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "quantity 不能为负数")).Err()
	}
	if err := h.stockUC.UpdateStock(ctx, req.GetProductId(), req.GetQuantity(), req.GetExpectedVersion()); err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.UpdateStockResponse{
		StockQuantity: req.GetQuantity(),
		Version:       req.GetExpectedVersion() + 1,
	}, nil
}

// DeductStock 扣减库存 RPC（仅内部 gRPC 调用）。
func (h *ProductHandler) DeductStock(ctx context.Context, req *productv1.DeductStockRequest) (*productv1.DeductStockResponse, error) {
	if req.GetProductId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "product_id 必须为正数")).Err()
	}
	if req.GetQuantity() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "quantity 必须大于 0")).Err()
	}
	remaining, err := h.stockUC.DeductStock(ctx, req.GetProductId(), req.GetQuantity())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.DeductStockResponse{Remaining: remaining}, nil
}

// RestoreStock 回补库存 RPC（仅内部 gRPC 调用）。
func (h *ProductHandler) RestoreStock(ctx context.Context, req *productv1.RestoreStockRequest) (*productv1.RestoreStockResponse, error) {
	if req.GetProductId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "product_id 必须为正数")).Err()
	}
	if req.GetQuantity() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "quantity 必须大于 0")).Err()
	}
	remaining, err := h.stockUC.RestoreStock(ctx, req.GetProductId(), req.GetQuantity())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.RestoreStockResponse{Remaining: remaining}, nil
}

// ==================== 秒杀活动 ====================

// GetSeckillActivity 按 ID 查询秒杀活动 RPC。
func (h *ProductHandler) GetSeckillActivity(ctx context.Context, req *productv1.GetSeckillActivityRequest) (*productv1.GetSeckillActivityResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	act, err := h.seckillUC.Get(ctx, req.GetId())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.GetSeckillActivityResponse{Activity: seckillActivityToProto(act)}, nil
}

// PrewarmSeckill 预热秒杀活动到 Redis RPC。
func (h *ProductHandler) PrewarmSeckill(ctx context.Context, req *productv1.PrewarmSeckillRequest) (*productv1.PrewarmSeckillResponse, error) {
	if req.GetId() <= 0 {
		return nil, errors.ToGRPCStatus(errors.New(errors.CodeInvalidArg, "id 必须为正数")).Err()
	}
	metaKey, stockKey, err := h.seckillUC.Prewarm(ctx, req.GetId())
	if err != nil {
		return nil, errors.ToGRPCStatus(err).Err()
	}
	return &productv1.PrewarmSeckillResponse{
		ActivityId: req.GetId(),
		MetaKey:    metaKey,
		StockKey:   stockKey,
	}, nil
}

// ==================== 转换辅助 ====================

// productViewToProto 将 ProductView(含库存)转为 proto Product 消息。
func productViewToProto(v *application.ProductView) *productv1.Product {
	return &productv1.Product{
		Id:             v.ID,
		Name:           v.Name,
		Description:    v.Description,
		Price:          v.Price,
		CategoryId:     v.CategoryID,
		ImageUrl:       v.ImageURL,
		Status:         v.Status,
		StockQuantity:  v.StockQuantity,
		CreatedAt:      v.CreatedAt.Unix(),
		UpdatedAt:      v.UpdatedAt.Unix(),
		GroupId:        v.GroupID,
		SpecLabel:      v.SpecLabel,
		SpecValuesJson: v.SpecValuesJSON,
		SortOrder:      v.SortOrder,
		StockVersion:   v.StockVersion,
	}
}

// productGroupToProto 将领域商品组转换为 proto 商品组。
func productGroupToProto(group *domain.ProductGroup) *productv1.ProductGroup {
	if group == nil {
		return nil
	}
	return &productv1.ProductGroup{
		Id:            group.ID,
		Name:          group.Name,
		Slug:          group.Slug,
		HeroTitle:     group.HeroTitle,
		HeroSubtitle:  group.HeroSubtitle,
		HeroImageUrl:  group.HeroImageURL,
		CoverImageUrl: group.CoverImageURL,
		CategoryId:    group.CategoryID,
		Status:        group.Status,
		SortOrder:     group.SortOrder,
		SpecKeys:      group.SpecKeys,
	}
}

// productVariantsToProto 将详情页同组版本列表转换为 proto 版本列表。
func productVariantsToProto(variants []application.ProductVariantView) []*productv1.ProductVariant {
	out := make([]*productv1.ProductVariant, 0, len(variants))
	for _, item := range variants {
		out = append(out, &productv1.ProductVariant{
			Id:             item.ID,
			SpecLabel:      item.SpecLabel,
			SpecValuesJson: item.SpecValuesJSON,
			ImageUrl:       item.ImageURL,
			Price:          item.Price,
			StockQuantity:  item.StockQuantity,
			Status:         item.Status,
		})
	}
	return out
}

// productMediasToProto 将应用层图库结构转换为 proto 图片列表。
func productMediasToProto(items []application.ProductMediaView) []*productv1.ProductMedia {
	out := make([]*productv1.ProductMedia, 0, len(items))
	for _, item := range items {
		out = append(out, &productv1.ProductMedia{
			Id:        item.ID,
			ImageUrl:  item.ImageURL,
			AltText:   item.AltText,
			SortOrder: item.SortOrder,
			IsPrimary: item.IsPrimary,
			BindingId: item.BindingID,
			UsageType: item.UsageType,
		})
	}
	return out
}

// mediaAssetToProto 将媒体领域对象转换为 proto 媒体元数据。
func mediaAssetToProto(asset *domain.MediaAsset) *productv1.MediaAssetInfo {
	if asset == nil {
		return nil
	}
	return &productv1.MediaAssetInfo{
		Id:         asset.ID,
		StorageKey: asset.StorageKey,
		PublicUrl:  asset.PublicURL,
		FileName:   asset.FileName,
		MimeType:   asset.MIMEType,
		SizeBytes:  asset.SizeBytes,
		Width:      asset.Width,
		Height:     asset.Height,
		AltText:    asset.AltText,
		CreatedAt:  asset.CreatedAt.Unix(),
		UpdatedAt:  asset.UpdatedAt.Unix(),
	}
}

// productGroupMediaBindingToProto 将商品组媒体绑定结果转换为 proto。
func productGroupMediaBindingToProto(binding *domain.ProductGroupMediaBinding) *productv1.ProductGroupMediaBinding {
	if binding == nil {
		return nil
	}
	return &productv1.ProductGroupMediaBinding{
		Id:        binding.ID,
		GroupId:   binding.GroupID,
		MediaId:   binding.MediaID,
		UsageType: binding.UsageType,
		SortOrder: binding.SortOrder,
		IsPrimary: binding.IsPrimary,
		Media:     mediaAssetToProto(binding.Media),
	}
}

// productMediaBindingToProto 将独立商品媒体绑定结果转换为 proto。
func productMediaBindingToProto(binding *domain.ProductMediaBinding) *productv1.ProductMediaBinding {
	if binding == nil {
		return nil
	}
	return &productv1.ProductMediaBinding{
		Id:        binding.ID,
		ProductId: binding.ProductID,
		MediaId:   binding.MediaID,
		UsageType: binding.UsageType,
		SortOrder: binding.SortOrder,
		IsPrimary: binding.IsPrimary,
		Media:     mediaAssetToProto(binding.Media),
	}
}

// RegisterMediaHTTP 在 product 服务 HTTP 侧挂载静态媒体目录。
func RegisterMediaHTTP(mux *http.ServeMux, mediaBaseURL string, mediaRoot string) {
	if mux == nil || mediaRoot == "" {
		return
	}
	// 静态媒体前缀属于 URL 路径，不应使用 filepath 语义处理，否则 "/media" 会被误清洗成 "//media"。
	cleanBase := path.Clean("/" + strings.TrimSpace(mediaBaseURL))
	if cleanBase == "." || cleanBase == "/" {
		cleanBase = "/media"
	}
	fs := http.FileServer(http.Dir(mediaRoot))
	mux.Handle(cleanBase+"/", http.StripPrefix(cleanBase+"/", fs))
}

// productToProto 将领域 Product 转为 proto Product 消息（列表场景,无库存）。
func productToProto(p *domain.Product) *productv1.Product {
	return &productv1.Product{
		Id:             p.ID,
		Name:           p.Name,
		Description:    p.Description,
		Price:          p.Price,
		CategoryId:     p.CategoryID,
		ImageUrl:       p.ImageURL,
		Status:         p.Status,
		CreatedAt:      p.CreatedAt.Unix(),
		UpdatedAt:      p.UpdatedAt.Unix(),
		GroupId:        p.GroupID,
		SpecLabel:      p.SpecLabel,
		SpecValuesJson: p.SpecValuesJSON,
		SortOrder:      p.SortOrder,
		CoverImageUrl:  p.CoverImageURL,
	}
}

// categoryToProto 将领域 Category 转为 proto Category 消息。
func categoryToProto(c *domain.Category) *productv1.Category {
	return &productv1.Category{
		Id:        c.ID,
		Name:      c.Name,
		SortOrder: c.SortOrder,
		CreatedAt: c.CreatedAt.Unix(),
		UpdatedAt: c.UpdatedAt.Unix(),
	}
}

// seckillActivityToProto 将领域 SeckillActivity 转为 proto 秒杀活动消息。
func seckillActivityToProto(a *domain.SeckillActivity) *productv1.SeckillActivity {
	return &productv1.SeckillActivity{
		Id:           a.ID,
		ProductId:    a.ProductID,
		Title:        a.Title,
		SeckillPrice: a.SeckillPrice,
		SeckillStock: a.SeckillStock,
		Status:       a.Status,
		StartAt:      a.StartAt.Unix(),
		EndAt:        a.EndAt.Unix(),
		CreatedAt:    a.CreatedAt.Unix(),
		UpdatedAt:    a.UpdatedAt.Unix(),
	}
}
