package mysql

import (
	"context"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// ProductRepo 商品仓储 GORM 实现,支持软删除。
type ProductRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewProductRepo 构造函数。
//   - db: GORM 数据库连接实例
func NewProductRepo(db *gorm.DB) *ProductRepo {
	return &ProductRepo{db: db}
}

// Create 创建商品,成功后回填 ID/CreatedAt/UpdatedAt。
//   - ctx: 上下文
//   - p: 领域商品对象
func (r *ProductRepo) Create(ctx context.Context, p *domain.Product) error {
	m := productToModel(p)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return err
	}
	p.ID = m.ID
	p.CreatedAt = m.CreatedAt
	p.UpdatedAt = m.UpdatedAt
	return nil
}

// FindByID 按主键查询商品,已软删除的记录视为不存在,返回 (nil, nil)。
//   - ctx: 上下文
//   - id: 商品主键
func (r *ProductRepo) FindByID(ctx context.Context, id int64) (*domain.Product, error) {
	var m ProductModel
	if err := r.db.WithContext(ctx).First(&m, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return productToDomain(&m), nil
}

// List 分页查询商品列表。
// categoryID > 0 时按类目过滤;GORM 自动过滤软删除记录。
// 排序:按创建时间降序(最新在前)。
//   - ctx: 上下文
//   - categoryID: 类目 ID,0 表示不过滤
//   - page: 页码(从 1 开始)
//   - pageSize: 每页大小
func (r *ProductRepo) List(ctx context.Context, categoryID int64, page, pageSize int) ([]*domain.Product, int64, error) {
	var total int64
	q := r.db.WithContext(ctx).Model(&ProductModel{})
	if categoryID > 0 {
		q = q.Where("category_id = ?", categoryID)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var models []ProductModel
	if err := q.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&models).Error; err != nil {
		return nil, 0, err
	}
	out := make([]*domain.Product, len(models))
	for i, m := range models {
		out[i] = productToDomain(&m)
	}
	return out, total, nil
}

// Update 全量更新商品非主键字段。
//   - ctx: 上下文
//   - p: 包含更新字段的领域商品对象
func (r *ProductRepo) Update(ctx context.Context, p *domain.Product) error {
	return r.db.WithContext(ctx).Model(&ProductModel{ID: p.ID}).Updates(map[string]any{
		"name": p.Name, "description": p.Description, "price": p.Price,
		"category_id": p.CategoryID, "image_url": p.ImageURL, "status": p.Status,
		"group_id": p.GroupID, "spec_label": p.SpecLabel, "spec_values_json": p.SpecValuesJSON, "sort_order": p.SortOrder,
	}).Error
}

// SoftDelete 软删除商品,设置 deleted_at 为当前时间。
//   - ctx: 上下文
//   - id: 商品主键
func (r *ProductRepo) SoftDelete(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).Delete(&ProductModel{}, id).Error
}
