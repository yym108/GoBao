package mysql

import (
	"context"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// ProductMediaRepo 提供独立商品媒体绑定的 GORM 仓储实现。
type ProductMediaRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewProductMediaRepo 构造独立商品媒体仓储。
func NewProductMediaRepo(db *gorm.DB) *ProductMediaRepo {
	return &ProductMediaRepo{db: db}
}

// ListByProductID 查询某个独立商品下的全部媒体绑定。
func (r *ProductMediaRepo) ListByProductID(ctx context.Context, productID int64) ([]domain.ProductMediaBinding, error) {
	var models []ProductMediaBindingModel
	if err := r.db.WithContext(ctx).
		Preload("Media").
		Where("product_id = ?", productID).
		Order("sort_order ASC, id ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}
	out := make([]domain.ProductMediaBinding, 0, len(models))
	for idx := range models {
		out = append(out, productMediaBindingToDomain(&models[idx]))
	}
	return out, nil
}

// Create 创建一条独立商品媒体绑定。
func (r *ProductMediaRepo) Create(ctx context.Context, binding *domain.ProductMediaBinding) error {
	model := productMediaBindingToModel(binding)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	binding.ID = model.ID
	binding.CreatedAt = model.CreatedAt
	binding.UpdatedAt = model.UpdatedAt
	return nil
}

// Update 更新某条独立商品媒体绑定的用途、排序与主图标记。
func (r *ProductMediaRepo) Update(ctx context.Context, binding *domain.ProductMediaBinding) error {
	if binding == nil {
		return nil
	}
	return r.db.WithContext(ctx).
		Model(&ProductMediaBindingModel{}).
		Where("product_id = ? AND id = ?", binding.ProductID, binding.ID).
		Updates(map[string]any{
			"usage_type": binding.UsageType,
			"sort_order": binding.SortOrder,
			"is_primary": binding.IsPrimary,
		}).Error
}

// Delete 删除某个独立商品上的一条媒体绑定。
func (r *ProductMediaRepo) Delete(ctx context.Context, productID int64, bindingID int64) error {
	return r.db.WithContext(ctx).
		Where("product_id = ? AND id = ?", productID, bindingID).
		Delete(&ProductMediaBindingModel{}).Error
}
