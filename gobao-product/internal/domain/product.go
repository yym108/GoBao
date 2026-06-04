// Package domain 定义 Product 服务的领域模型与仓储接口,无任何框架依赖。
package domain

import "time"

// Product 商品聚合根。价格统一以"分"为单位存储(int64),避免浮点运算精度误差。
type Product struct {
	ID             int64     // 商品主键
	GroupID        int64     // 所属商品组 ID，0 表示暂未归组
	Name           string    // 商品名称
	Description    string    // 商品描述
	Price          int64     // 价格(分)
	CategoryID     int64     // 关联的类目 ID
	SpecLabel      string    // 规格展示文案，例如“16GB / 512GB”
	SpecValuesJSON string    // 结构化规格 JSON，供前端渲染版本切换
	ImageURL       string    // 主图 URL
	CoverImageURL  string    // 商品组列表封面图
	Status         int32     // 上下架状态:1=上架 2=下架
	SortOrder      int32     // 同组内排序权重，值越小越靠前
	CreatedAt      time.Time // 创建时间
	UpdatedAt      time.Time // 更新时间
}

// 商品状态枚举,避免魔数散落各处。
const (
	ProductStatusOnSale  int32 = 1 // 上架,可被列表/详情查询到
	ProductStatusOffSale int32 = 2 // 下架,仅管理后台可见
)
