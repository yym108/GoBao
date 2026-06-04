package domain

import "context"

// AdminRepository 定义管理员持久化接口，由 adapter/repository 层实现。
type AdminRepository interface {
	// Create 创建管理员账号，成功后回写 ID 与时间戳。
	Create(ctx context.Context, admin *Admin) error

	// FindByID 按管理员 ID 查询。未找到返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*Admin, error)

	// FindByEmail 按邮箱查询管理员。未找到返回 (nil, nil)。
	FindByEmail(ctx context.Context, email string) (*Admin, error)

	// ExistsByEmail 检查邮箱是否已存在。
	ExistsByEmail(ctx context.Context, email string) (bool, error)

	// List 查询全部管理员账号，按 ID 升序返回。
	List(ctx context.Context) ([]*Admin, error)

	// UpdatePasswordHash 更新指定管理员密码哈希。
	UpdatePasswordHash(ctx context.Context, adminID int64, passwordHash string) error
}
