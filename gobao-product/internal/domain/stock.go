package domain

import "time"

// Stock 商品库存。与 Product 一对一(product_id UNIQUE)。
// 单独表设计便于:
//  1. 高频扣减时不锁 products 行;
//  2. 后续拆 Inventory Service 时整表迁移;
//  3. 通过 Version 字段实现乐观锁 CAS 扣减,防止 ABA。
type Stock struct {
	ID        int64     // 库存记录主键
	ProductID int64     // 关联的商品 ID(唯一)
	Quantity  int32     // 当前库存数量
	Version   int32     // 乐观锁版本号,每次更新自增
	UpdatedAt time.Time // 更新时间
}
