package application

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// MediaStore 抽象媒体文件存储实现。
// 当前阶段由本地文件系统实现，后续可替换为对象存储而不影响业务层。
type MediaStore interface {
	Save(ctx context.Context, folder string, originalName string, payload []byte) (storageKey string, publicURL string, err error)
	Delete(ctx context.Context, storageKey string) error
}

// MediaAdminUseCase 提供后台媒体上传与绑定能力。
// 当前仅落最小可用能力，供后续后台管理界面接入。
type MediaAdminUseCase struct {
	mediaRepo        domain.MediaAssetRepository        // 媒体资源仓储
	groupMediaRepo   domain.ProductGroupMediaRepository // 商品组媒体绑定仓储
	productMediaRepo domain.ProductMediaRepository      // 独立商品媒体绑定仓储
	groupRepo        domain.ProductGroupRepository      // 商品组查询仓储
	prodRepo         domain.ProductRepository           // 独立商品查询仓储
	store            MediaStore                         // 文件存储适配层
}

// NewMediaAdminUseCase 构造媒体后台用例。
func NewMediaAdminUseCase(
	mediaRepo domain.MediaAssetRepository,
	groupMediaRepo domain.ProductGroupMediaRepository,
	productMediaRepo domain.ProductMediaRepository,
	groupRepo domain.ProductGroupRepository,
	prodRepo domain.ProductRepository,
	store MediaStore,
) *MediaAdminUseCase {
	return &MediaAdminUseCase{
		mediaRepo:        mediaRepo,
		groupMediaRepo:   groupMediaRepo,
		productMediaRepo: productMediaRepo,
		groupRepo:        groupRepo,
		prodRepo:         prodRepo,
		store:            store,
	}
}

// UploadInput 表示后台上传图片时的最小输入。
type UploadInput struct {
	Folder       string // 保存子目录
	OriginalName string // 原始文件名
	AltText      string // 替代文本
	MIMEType     string // MIME 类型
	Payload      []byte // 文件内容
}

// UploadMedia 上传一张图片并落一条媒体元数据。
func (uc *MediaAdminUseCase) UploadMedia(ctx context.Context, input UploadInput) (*domain.MediaAsset, error) {
	if uc == nil || uc.store == nil || uc.mediaRepo == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "媒体上传能力未初始化")
	}
	if len(input.Payload) == 0 {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "图片内容不能为空")
	}
	originalName := strings.TrimSpace(input.OriginalName)
	if originalName == "" {
		originalName = "upload.bin"
	}
	storageKey, publicURL, err := uc.store.Save(ctx, filepath.Clean(input.Folder), originalName, input.Payload)
	if err != nil {
		return nil, err
	}
	asset := &domain.MediaAsset{
		StorageKey: storageKey,
		PublicURL:  publicURL,
		FileName:   originalName,
		MIMEType:   strings.TrimSpace(input.MIMEType),
		SizeBytes:  int64(len(input.Payload)),
		AltText:    strings.TrimSpace(input.AltText),
	}
	if asset.MIMEType == "" {
		asset.MIMEType = "application/octet-stream"
	}
	if err := uc.mediaRepo.Create(ctx, asset); err != nil {
		_ = uc.store.Delete(ctx, storageKey)
		return nil, err
	}
	return asset, nil
}

// BindGroupMedia 将媒体绑定到商品组。
func (uc *MediaAdminUseCase) BindGroupMedia(ctx context.Context, groupID int64, mediaID int64, usageType string, sortOrder int32, isPrimary bool) (*domain.ProductGroupMediaBinding, error) {
	if uc.groupRepo == nil || uc.groupMediaRepo == nil || uc.mediaRepo == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组媒体绑定能力未初始化")
	}
	group, err := uc.groupRepo.FindByID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品组不存在")
	}
	asset, err := uc.mediaRepo.FindByID(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	if asset == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "媒体资源不存在")
	}
	if !isSupportedMediaUsage(usageType) {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "媒体用途不支持")
	}
	binding := &domain.ProductGroupMediaBinding{
		GroupID:   groupID,
		MediaID:   mediaID,
		UsageType: usageType,
		SortOrder: sortOrder,
		IsPrimary: isPrimary,
		Media:     asset,
	}
	if err := uc.groupMediaRepo.Create(ctx, binding); err != nil {
		return nil, err
	}
	return binding, nil
}

// BindProductMedia 将媒体绑定到独立商品。
func (uc *MediaAdminUseCase) BindProductMedia(ctx context.Context, productID int64, mediaID int64, usageType string, sortOrder int32, isPrimary bool) (*domain.ProductMediaBinding, error) {
	if uc.prodRepo == nil || uc.productMediaRepo == nil || uc.mediaRepo == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品媒体绑定能力未初始化")
	}
	product, err := uc.prodRepo.FindByID(ctx, productID)
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	asset, err := uc.mediaRepo.FindByID(ctx, mediaID)
	if err != nil {
		return nil, err
	}
	if asset == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "媒体资源不存在")
	}
	if usageType == "" {
		usageType = domain.MediaUsageTypeGallery
	}
	if usageType != domain.MediaUsageTypeGallery {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "独立商品当前仅支持图库图片")
	}
	binding := &domain.ProductMediaBinding{
		ProductID: productID,
		MediaID:   mediaID,
		UsageType: usageType,
		SortOrder: sortOrder,
		IsPrimary: isPrimary,
		Media:     asset,
	}
	if err := uc.productMediaRepo.Create(ctx, binding); err != nil {
		return nil, err
	}
	return binding, nil
}

// UpdateGroupMediaBinding 更新商品组媒体绑定属性。
// 该写口只修改绑定关系本身，不修改媒体资源文件，也不修改商品组其它展示字段。
func (uc *MediaAdminUseCase) UpdateGroupMediaBinding(ctx context.Context, groupID int64, bindingID int64, usageType string, sortOrder int32, isPrimary bool) (*domain.ProductGroupMediaBinding, error) {
	if uc.groupRepo == nil || uc.groupMediaRepo == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组媒体更新能力未初始化")
	}
	group, err := uc.groupRepo.FindByID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if group == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品组不存在")
	}
	if !isSupportedMediaUsage(usageType) {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "媒体用途不支持")
	}

	items, err := uc.groupMediaRepo.ListByGroupID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	for idx := range items {
		if items[idx].ID != bindingID {
			continue
		}
		items[idx].UsageType = usageType
		items[idx].SortOrder = sortOrder
		items[idx].IsPrimary = isPrimary
		if err := uc.groupMediaRepo.Update(ctx, &items[idx]); err != nil {
			return nil, err
		}
		return &items[idx], nil
	}
	return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品组媒体绑定不存在")
}

// UpdateProductMediaBinding 更新独立商品媒体绑定属性。
// 当前独立商品仍只允许图库图片，因此 usage_type 固定校验为 gallery。
func (uc *MediaAdminUseCase) UpdateProductMediaBinding(ctx context.Context, productID int64, bindingID int64, usageType string, sortOrder int32, isPrimary bool) (*domain.ProductMediaBinding, error) {
	if uc.prodRepo == nil || uc.productMediaRepo == nil {
		return nil, pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品媒体更新能力未初始化")
	}
	product, err := uc.prodRepo.FindByID(ctx, productID)
	if err != nil {
		return nil, err
	}
	if product == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品不存在")
	}
	if usageType == "" {
		usageType = domain.MediaUsageTypeGallery
	}
	if usageType != domain.MediaUsageTypeGallery {
		return nil, pkgerrors.New(pkgerrors.CodeInvalidArg, "独立商品当前仅支持图库图片")
	}

	items, err := uc.productMediaRepo.ListByProductID(ctx, productID)
	if err != nil {
		return nil, err
	}
	for idx := range items {
		if items[idx].ID != bindingID {
			continue
		}
		items[idx].UsageType = usageType
		items[idx].SortOrder = sortOrder
		items[idx].IsPrimary = isPrimary
		if err := uc.productMediaRepo.Update(ctx, &items[idx]); err != nil {
			return nil, err
		}
		return &items[idx], nil
	}
	return nil, pkgerrors.New(pkgerrors.CodeNotFound, "商品媒体绑定不存在")
}

// DeleteGroupMediaBinding 删除商品组上的一条媒体绑定。
func (uc *MediaAdminUseCase) DeleteGroupMediaBinding(ctx context.Context, groupID int64, bindingID int64) error {
	if uc.groupMediaRepo == nil {
		return pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品组媒体删除能力未初始化")
	}
	return uc.groupMediaRepo.Delete(ctx, groupID, bindingID)
}

// DeleteProductMediaBinding 删除独立商品上的一条媒体绑定。
func (uc *MediaAdminUseCase) DeleteProductMediaBinding(ctx context.Context, productID int64, bindingID int64) error {
	if uc.productMediaRepo == nil {
		return pkgerrors.New(pkgerrors.CodeFailedPrecondition, "商品媒体删除能力未初始化")
	}
	return uc.productMediaRepo.Delete(ctx, productID, bindingID)
}

func isSupportedMediaUsage(usageType string) bool {
	switch usageType {
	case domain.MediaUsageTypeCover, domain.MediaUsageTypeHero, domain.MediaUsageTypeGallery:
		return true
	default:
		return false
	}
}

// BuildMediaFolderForGroup 根据商品组与用途生成推荐目录。
func BuildMediaFolderForGroup(groupID int64, usageType string) string {
	return filepath.ToSlash(filepath.Join("groups", fmt.Sprintf("%d", groupID), usageType))
}

// BuildMediaFolderForProduct 根据独立商品生成推荐图库目录。
func BuildMediaFolderForProduct(productID int64) string {
	return filepath.ToSlash(filepath.Join("products", fmt.Sprintf("%d", productID), domain.MediaUsageTypeGallery))
}
