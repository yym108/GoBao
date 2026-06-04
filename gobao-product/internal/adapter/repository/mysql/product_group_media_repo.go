package mysql

import (
	"context"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// ProductGroupMediaRepo 提供商品组媒体绑定的 GORM 仓储实现。
type ProductGroupMediaRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewProductGroupMediaRepo 构造商品组媒体仓储。
func NewProductGroupMediaRepo(db *gorm.DB) *ProductGroupMediaRepo {
	return &ProductGroupMediaRepo{db: db}
}

// ListByGroupID 查询某个商品组下的全部媒体绑定。
func (r *ProductGroupMediaRepo) ListByGroupID(ctx context.Context, groupID int64) ([]domain.ProductGroupMediaBinding, error) {
	var models []ProductGroupMediaBindingModel
	if err := r.db.WithContext(ctx).
		Preload("Media").
		Where("group_id = ?", groupID).
		Order("sort_order ASC, id ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}
	out := make([]domain.ProductGroupMediaBinding, 0, len(models))
	for idx := range models {
		out = append(out, productGroupMediaBindingToDomain(&models[idx]))
	}
	return out, nil
}

// Create 创建一条商品组媒体绑定。
func (r *ProductGroupMediaRepo) Create(ctx context.Context, binding *domain.ProductGroupMediaBinding) error {
	model := productGroupMediaBindingToModel(binding)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	binding.ID = model.ID
	binding.CreatedAt = model.CreatedAt
	binding.UpdatedAt = model.UpdatedAt
	return nil
}

// Update 更新某条商品组媒体绑定的用途、排序与主图标记。
func (r *ProductGroupMediaRepo) Update(ctx context.Context, binding *domain.ProductGroupMediaBinding) error {
	if binding == nil {
		return nil
	}
	return r.db.WithContext(ctx).
		Model(&ProductGroupMediaBindingModel{}).
		Where("group_id = ? AND id = ?", binding.GroupID, binding.ID).
		Updates(map[string]any{
			"usage_type": binding.UsageType,
			"sort_order": binding.SortOrder,
			"is_primary": binding.IsPrimary,
		}).Error
}

// Delete 删除某个商品组上的一条媒体绑定。
func (r *ProductGroupMediaRepo) Delete(ctx context.Context, groupID int64, bindingID int64) error {
	return r.db.WithContext(ctx).
		Where("group_id = ? AND id = ?", groupID, bindingID).
		Delete(&ProductGroupMediaBindingModel{}).Error
}
