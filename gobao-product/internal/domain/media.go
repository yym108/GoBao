package domain

import "time"

// MediaUsageType 定义媒体资源在商品域内的使用位置。
const (
	MediaUsageTypeCover   = "cover"   // 商品组列表封面
	MediaUsageTypeHero    = "hero"    // 商品组详情主视觉
	MediaUsageTypeGallery = "gallery" // 商品组或独立商品的图库图片
)

// MediaAsset 表示一条可复用的图片资源元数据。
// 文件实体保存在 product 服务本地文件系统，数据库只保存索引与展示信息。
type MediaAsset struct {
	ID         int64     // 媒体主键
	StorageKey string    // 文件系统内部定位键
	PublicURL  string    // 对前端暴露的可访问 URL
	FileName   string    // 原始文件名
	MIMEType   string    // 文件 MIME 类型
	SizeBytes  int64     // 文件大小
	Width      int32     // 图片宽度
	Height     int32     // 图片高度
	AltText    string    // 图片替代文本
	CreatedAt  time.Time // 创建时间
	UpdatedAt  time.Time // 更新时间
}

// ProductGroupMediaBinding 表示商品组与媒体资源的绑定关系。
type ProductGroupMediaBinding struct {
	ID        int64       // 绑定主键
	GroupID   int64       // 商品组 ID
	MediaID   int64       // 媒体资源 ID
	UsageType string      // 使用场景：cover/hero/gallery
	SortOrder int32       // 展示排序
	IsPrimary bool        // 是否主图
	Media     *MediaAsset // 预加载的媒体实体
	CreatedAt time.Time   // 创建时间
	UpdatedAt time.Time   // 更新时间
}

// ProductMediaBinding 表示独立商品与媒体资源的绑定关系。
type ProductMediaBinding struct {
	ID        int64       // 绑定主键
	ProductID int64       // 独立商品 ID
	MediaID   int64       // 媒体资源 ID
	UsageType string      // 当前阶段固定 gallery，预留扩展
	SortOrder int32       // 展示排序
	IsPrimary bool        // 是否主图
	Media     *MediaAsset // 预加载的媒体实体
	CreatedAt time.Time   // 创建时间
	UpdatedAt time.Time   // 更新时间
}
