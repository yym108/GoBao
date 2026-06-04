package mysql

import (
	"context"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// CategoryRepo 类目仓储 GORM 实现。
type CategoryRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewCategoryRepo 构造函数。
//   - db: GORM 数据库连接实例
func NewCategoryRepo(db *gorm.DB) *CategoryRepo {
	return &CategoryRepo{db: db}
}

// Create 创建类目,成功后回填 ID/CreatedAt/UpdatedAt。
//   - ctx: 上下文
//   - c: 领域类目对象
func (r *CategoryRepo) Create(ctx context.Context, c *domain.Category) error {
	m := categoryToModel(c)
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return err
	}
	c.ID = m.ID
	c.CreatedAt = m.CreatedAt
	c.UpdatedAt = m.UpdatedAt
	return nil
}

// FindByID 按主键查询类目,未找到返回 (nil, nil)。
//   - ctx: 上下文
//   - id: 类目主键
func (r *CategoryRepo) FindByID(ctx context.Context, id int64) (*domain.Category, error) {
	var m CategoryModel
	if err := r.db.WithContext(ctx).First(&m, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return categoryToDomain(&m), nil
}

// List 全量查询类目,按 sort_order 升序、id 升序。
//   - ctx: 上下文
func (r *CategoryRepo) List(ctx context.Context) ([]*domain.Category, error) {
	var models []CategoryModel
	if err := r.db.WithContext(ctx).Order("sort_order ASC, id ASC").Find(&models).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.Category, len(models))
	for i, m := range models {
		out[i] = categoryToDomain(&m)
	}
	return out, nil
}

// Update 更新类目名称与排序权重。
//   - ctx: 上下文
//   - c: 包含更新字段的领域类目对象
func (r *CategoryRepo) Update(ctx context.Context, c *domain.Category) error {
	return r.db.WithContext(ctx).Model(&CategoryModel{ID: c.ID}).Updates(map[string]any{
		"name":       c.Name,
		"sort_order": c.SortOrder,
	}).Error
}

// Delete 物理删除类目。
//   - ctx: 上下文
//   - id: 类目主键
func (r *CategoryRepo) Delete(ctx context.Context, id int64) error {
	return r.db.WithContext(ctx).Delete(&CategoryModel{}, id).Error
}

// ExistsByName 校验名称是否已存在。
//   - ctx: 上下文
//   - name: 待校验的类目名称
//   - excludeID: >0 时排除该 ID(用于更新场景排除自身)
func (r *CategoryRepo) ExistsByName(ctx context.Context, name string, excludeID int64) (bool, error) {
	var count int64
	q := r.db.WithContext(ctx).Model(&CategoryModel{}).Where("name = ?", name)
	if excludeID > 0 {
		q = q.Where("id != ?", excludeID)
	}
	if err := q.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}
