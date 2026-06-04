package mysql

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"github.com/yym108/gobao-admin/internal/domain"
)

// AdminRepo 是 domain.AdminRepository 的 GORM/MySQL 实现。
type AdminRepo struct {
	db *gorm.DB // GORM 数据库连接实例
}

// NewAdminRepo 构造 AdminRepo。
func NewAdminRepo(db *gorm.DB) *AdminRepo {
	return &AdminRepo{db: db}
}

// Create 创建管理员记录。
func (r *AdminRepo) Create(ctx context.Context, admin *domain.Admin) error {
	model := toModel(admin)
	if err := r.db.WithContext(ctx).Create(model).Error; err != nil {
		return err
	}
	admin.ID = model.ID
	admin.CreatedAt = model.CreatedAt
	admin.UpdatedAt = model.UpdatedAt
	return nil
}

// FindByID 按管理员 ID 查询。
func (r *AdminRepo) FindByID(ctx context.Context, id int64) (*domain.Admin, error) {
	var model AdminModel
	if err := r.db.WithContext(ctx).Where("id = ?", id).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return toDomain(&model), nil
}

// FindByEmail 按邮箱查询管理员。
func (r *AdminRepo) FindByEmail(ctx context.Context, email string) (*domain.Admin, error) {
	var model AdminModel
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&model).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return toDomain(&model), nil
}

// ExistsByEmail 检查邮箱是否已存在。
func (r *AdminRepo) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&AdminModel{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// List 查询全部管理员账号。
func (r *AdminRepo) List(ctx context.Context) ([]*domain.Admin, error) {
	var models []AdminModel
	if err := r.db.WithContext(ctx).Order("id ASC").Find(&models).Error; err != nil {
		return nil, err
	}
	items := make([]*domain.Admin, 0, len(models))
	for i := range models {
		items = append(items, toDomain(&models[i]))
	}
	return items, nil
}

// UpdatePasswordHash 更新管理员密码哈希。
func (r *AdminRepo) UpdatePasswordHash(ctx context.Context, adminID int64, passwordHash string) error {
	return r.db.WithContext(ctx).
		Model(&AdminModel{}).
		Where("id = ?", adminID).
		Update("password_hash", passwordHash).Error
}
