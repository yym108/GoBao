package domain

import (
	"context"
	"time"
)

// OrderRepository 定义订单聚合的仓储抽象。
// application 层只依赖该接口，方便后续替换持久化实现或补充事务编排。
type OrderRepository interface {
	// Create 持久化订单聚合，并回填订单与明细主键。
	Create(ctx context.Context, order *Order) error
	// FindByID 按主键查询订单聚合，未找到时返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*Order, error)
	// ListByUserID 按用户分页查询订单列表，返回当前页订单和总数。
	ListByUserID(ctx context.Context, userID int64, page, pageSize int) ([]*Order, int64, error)
	// ListAll 管理员分页查询全部订单，可选按状态与用户过滤（status 为空不过滤、userID 为 0 不过滤）。
	ListAll(ctx context.Context, status string, userID int64, page, pageSize int) ([]*Order, int64, error)
	// UpdateStatus 在旧状态匹配时原子更新订单状态，并按需写入关闭信息。
	// closeReason 和 closedAt 只在订单进入关闭态时填写，普通状态推进可传空值。
	UpdateStatus(ctx context.Context, id int64, fromStatus, toStatus string, updatedAt time.Time, closeReason string, closedAt *time.Time) (bool, error)
}
