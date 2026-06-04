// Package domain 定义 Product 服务的领域模型与仓储接口,无任何框架依赖。
package domain

import "time"

// 秒杀活动状态枚举。
const (
	SeckillStatusDraft    int32 = 1 // 草稿，未开放预热与抢购
	SeckillStatusActive   int32 = 2 // 激活，可预热并允许后续进入抢购链路
	SeckillStatusDisabled int32 = 3 // 禁用，活动不可用
)

// SeckillActivity 秒杀活动聚合。
// 活动价格独立于商品原价，库存也独立于普通库存配额。
type SeckillActivity struct {
	ID           int64     // 活动主键
	ProductID    int64     // 关联商品 ID
	Title        string    // 活动标题
	SeckillPrice int64     // 秒杀价(分)
	SeckillStock int32     // 活动库存配额
	Status       int32     // 活动状态
	StartAt      time.Time // 活动开始时间
	EndAt        time.Time // 活动结束时间
	CreatedAt    time.Time // 创建时间
	UpdatedAt    time.Time // 更新时间
}
