package mysql

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// ProductGroupRepo 提供商品组的 MySQL 读取实现。
// 该仓储只负责商品家族展示层的查询，不参与库存与订单真值计算。
type ProductGroupRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewProductGroupRepo 构造商品组仓储。
//   - db: GORM 数据库连接实例
func NewProductGroupRepo(db *gorm.DB) *ProductGroupRepo {
	return &ProductGroupRepo{db: db}
}

// FindByID 按商品组主键查询单个商品组，未找到返回 (nil, nil)。
func (r *ProductGroupRepo) FindByID(ctx context.Context, id int64) (*domain.ProductGroup, error) {
	var model ProductGroupModel
	if err := r.db.WithContext(ctx).First(&model, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return productGroupToDomain(&model), nil
}

// List 按类目分页查询商品组，按 sort_order、id 升序返回。
func (r *ProductGroupRepo) List(ctx context.Context, categoryID int64, page, pageSize int) ([]domain.ProductGroup, int64, error) {
	var total int64
	query := r.db.WithContext(ctx).Model(&ProductGroupModel{})
	if categoryID > 0 {
		query = query.Where("category_id = ?", categoryID)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var models []ProductGroupModel
	if err := query.
		Order("sort_order ASC, id ASC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&models).Error; err != nil {
		return nil, 0, err
	}

	out := make([]domain.ProductGroup, 0, len(models))
	for idx := range models {
		item := productGroupToDomain(&models[idx])
		if item == nil {
			continue
		}
		out = append(out, *item)
	}
	return out, total, nil
}

// ListProductsByGroupID 查询同一商品组下的全部商品，按 sort_order、id 升序返回。
func (r *ProductGroupRepo) ListProductsByGroupID(ctx context.Context, groupID int64) ([]*domain.Product, error) {
	var models []ProductModel
	if err := r.db.WithContext(ctx).
		Where("group_id = ?", groupID).
		Order("sort_order ASC, id ASC").
		Find(&models).Error; err != nil {
		return nil, err
	}

	out := make([]*domain.Product, 0, len(models))
	for idx := range models {
		out = append(out, productToDomain(&models[idx]))
	}
	return out, nil
}

// Create 创建商品组并回填主键与时间字段。
func (r *ProductGroupRepo) Create(ctx context.Context, group *domain.ProductGroup) error {
	model := &ProductGroupModel{
		ID:            group.ID,
		Name:          group.Name,
		Slug:          group.Slug,
		HeroTitle:     group.HeroTitle,
		HeroSubtitle:  group.HeroSubtitle,
		HeroImageURL:  group.HeroImageURL,
		CoverImageURL: group.CoverImageURL,
		CategoryID:    group.CategoryID,
		Status:        group.Status,
		SortOrder:     group.SortOrder,
		SpecKeysJSON:  encodeSpecKeys(group.SpecKeys),
		CreatedAt:     group.CreatedAt,
		UpdatedAt:     group.UpdatedAt,
	}
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	group.ID = model.ID
	group.CreatedAt = model.CreatedAt
	group.UpdatedAt = model.UpdatedAt
	return nil
}

// Update 更新商品组基础字段。
func (r *ProductGroupRepo) Update(ctx context.Context, group *domain.ProductGroup) error {
	return r.db.WithContext(ctx).Model(&ProductGroupModel{ID: group.ID}).Updates(map[string]any{
		"name":            group.Name,
		"slug":            group.Slug,
		"hero_title":      group.HeroTitle,
		"hero_subtitle":   group.HeroSubtitle,
		"hero_image_url":  group.HeroImageURL,
		"cover_image_url": group.CoverImageURL,
		"category_id":     group.CategoryID,
		"status":          group.Status,
		"sort_order":      group.SortOrder,
		"spec_keys_json":  encodeSpecKeys(group.SpecKeys),
	}).Error
}

// Delete 删除商品组。
func (r *ProductGroupRepo) Delete(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).Delete(&ProductGroupModel{}, id).Error
}

// ExistsBySlug 检查商品组 slug 是否已存在。
func (r *ProductGroupRepo) ExistsBySlug(ctx context.Context, slug string, excludeID int64) (bool, error) {
	query := r.db.WithContext(ctx).Model(&ProductGroupModel{}).Where("slug = ?", slug)
	if excludeID > 0 {
		query = query.Where("id <> ?", excludeID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// CountProductsByGroupID 统计商品组下的独立商品数量。
func (r *ProductGroupRepo) CountProductsByGroupID(ctx context.Context, groupID int64) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&ProductModel{}).Where("group_id = ?", groupID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// CountByCategoryID 统计某个类目下的商品组数量。
func (r *ProductGroupRepo) CountByCategoryID(ctx context.Context, categoryID int64) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&ProductGroupModel{}).Where("category_id = ?", categoryID).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// ClearCategoryByCategoryID 将某个类目下的全部商品组置为暂无类目。
func (r *ProductGroupRepo) ClearCategoryByCategoryID(ctx context.Context, categoryID int64) error {
	return r.db.WithContext(ctx).
		Model(&ProductGroupModel{}).
		Where("category_id = ?", categoryID).
		Update("category_id", 0).
		Error
}
