package domain

import "time"

// Category 商品类目。
// 类目名称在表层加 UNIQUE 约束,SortOrder 越小越靠前。
type Category struct {
	ID        int64     // 类目主键
	Name      string    // 类目名称(全局唯一)
	SortOrder int32     // 排序权重,值越小越靠前展示
	CreatedAt time.Time // 创建时间
	UpdatedAt time.Time // 更新时间
}
