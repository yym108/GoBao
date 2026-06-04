package domain

import "time"

// ProductGroup 表示前端一个详情页对应的商品家族。
// 同组下的多个独立商品共享展示入口，但每个商品仍独立销售、独立计库存。
type ProductGroup struct {
	ID            int64     // 商品组主键
	Name          string    // 商品组名称，例如“MacBook Air 13”
	Slug          string    // 面向路由与后台检索的稳定标识
	HeroTitle     string    // 详情页头图主标题
	HeroSubtitle  string    // 详情页头图副标题
	HeroImageURL  string    // 详情页头图 URL
	CoverImageURL string    // 列表卡片封面图
	CategoryID    int64     // 所属类目 ID，0 表示暂无类目
	Status        int32     // 商品组状态：1=启用 2=停用
	SortOrder     int32     // 排序权重，值越小越靠前
	SpecKeys      []string  // 规格维度名称，子商品只能填这些维度的值
	CreatedAt     time.Time // 创建时间
	UpdatedAt     time.Time // 更新时间
}
