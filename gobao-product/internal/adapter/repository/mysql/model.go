// Package mysql 提供 Product 服务各聚合的 GORM 仓储实现。
// 生产环境连接 MySQL 8,集成测试使用 SQLite in-memory。
package mysql

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// encodeSpecKeys 将规格维度名称序列化为 JSON 数组文本，空维度统一写入 "[]"。
func encodeSpecKeys(keys []string) string {
	if len(keys) == 0 {
		return "[]"
	}
	raw, err := json.Marshal(keys)
	if err != nil {
		return "[]"
	}
	return string(raw)
}

// decodeSpecKeys 将 JSON 数组文本还原为规格维度名称，空文本或非法 JSON 还原为空切片。
func decodeSpecKeys(raw string) []string {
	if raw == "" {
		return nil
	}
	var keys []string
	if err := json.Unmarshal([]byte(raw), &keys); err != nil {
		return nil
	}
	return keys
}

// ---------- CategoryModel ----------

// CategoryModel GORM 类目模型（无软删除,物理删除）。
type CategoryModel struct {
	ID        int64     `gorm:"column:id;primaryKey;autoIncrement"`        // 类目主键
	Name      string    `gorm:"column:name;type:varchar(100);uniqueIndex"` // 类目名称(唯一)
	SortOrder int32     `gorm:"column:sort_order;default:0"`               // 排序权重
	CreatedAt time.Time `gorm:"column:created_at"`                         // 创建时间
	UpdatedAt time.Time `gorm:"column:updated_at"`                         // 更新时间
}

// TableName 指定类目表名。
func (CategoryModel) TableName() string { return "categories" }

// categoryToDomain 将 GORM 模型转换为领域对象。
func categoryToDomain(m *CategoryModel) *domain.Category {
	return &domain.Category{
		ID: m.ID, Name: m.Name, SortOrder: m.SortOrder,
		CreatedAt: m.CreatedAt, UpdatedAt: m.UpdatedAt,
	}
}

// categoryToModel 将领域对象转换为 GORM 模型。
func categoryToModel(d *domain.Category) *CategoryModel {
	return &CategoryModel{
		ID: d.ID, Name: d.Name, SortOrder: d.SortOrder,
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt,
	}
}

// ---------- ProductModel ----------

// ProductModel GORM 商品模型(支持软删除)。
type ProductModel struct {
	ID             int64          `gorm:"column:id;primaryKey;autoIncrement"`                      // 商品主键
	GroupID        int64          `gorm:"column:group_id;not null;default:0;index:idx_group"`      // 所属商品组 ID
	Name           string         `gorm:"column:name;type:varchar(200);not null"`                  // 商品名称
	Description    string         `gorm:"column:description;type:text"`                            // 商品描述
	Price          int64          `gorm:"column:price;not null"`                                   // 价格(分)
	CategoryID     int64          `gorm:"column:category_id;not null;index:idx_category_id"`       // 类目 ID
	SpecLabel      string         `gorm:"column:spec_label;type:varchar(255);not null;default:''"` // 规格展示文案
	SpecValuesJSON string         `gorm:"column:spec_values_json;type:text"`                       // 结构化规格 JSON
	ImageURL       string         `gorm:"column:image_url;type:varchar(500)"`                      // 主图 URL
	Status         int32          `gorm:"column:status;default:1;index:idx_status"`                // 1=上架 2=下架
	SortOrder      int32          `gorm:"column:sort_order;not null;default:0"`                    // 同组内排序权重
	DeletedAt      gorm.DeletedAt `gorm:"column:deleted_at;index"`                                 // 软删除时间
	CreatedAt      time.Time      `gorm:"column:created_at"`                                       // 创建时间
	UpdatedAt      time.Time      `gorm:"column:updated_at"`                                       // 更新时间
}

// TableName 指定商品表名。
func (ProductModel) TableName() string { return "products" }

// productToDomain 将 GORM 模型转换为领域对象。
func productToDomain(m *ProductModel) *domain.Product {
	return &domain.Product{
		ID:             m.ID,
		GroupID:        m.GroupID,
		Name:           m.Name,
		Description:    m.Description,
		Price:          m.Price,
		CategoryID:     m.CategoryID,
		SpecLabel:      m.SpecLabel,
		SpecValuesJSON: m.SpecValuesJSON,
		ImageURL:       m.ImageURL,
		Status:         m.Status,
		SortOrder:      m.SortOrder,
		CreatedAt:      m.CreatedAt,
		UpdatedAt:      m.UpdatedAt,
	}
}

// productToModel 将领域对象转换为 GORM 模型。
func productToModel(d *domain.Product) *ProductModel {
	return &ProductModel{
		ID:             d.ID,
		GroupID:        d.GroupID,
		Name:           d.Name,
		Description:    d.Description,
		Price:          d.Price,
		CategoryID:     d.CategoryID,
		SpecLabel:      d.SpecLabel,
		SpecValuesJSON: d.SpecValuesJSON,
		ImageURL:       d.ImageURL,
		Status:         d.Status,
		SortOrder:      d.SortOrder,
		CreatedAt:      d.CreatedAt,
		UpdatedAt:      d.UpdatedAt,
	}
}

// ---------- ProductGroupModel ----------

// ProductGroupModel GORM 商品组模型。
// 该模型承载前端一个详情页对应的商品家族展示信息，不直接参与交易。
type ProductGroupModel struct {
	ID            int64     `gorm:"column:id;primaryKey;autoIncrement"`                             // 商品组主键
	Name          string    `gorm:"column:name;type:varchar(200);not null"`                         // 商品组名称
	Slug          string    `gorm:"column:slug;type:varchar(200);not null;uniqueIndex"`             // 商品组稳定标识
	HeroTitle     string    `gorm:"column:hero_title;type:varchar(255)"`                            // 头图主标题
	HeroSubtitle  string    `gorm:"column:hero_subtitle;type:varchar(255)"`                         // 头图副标题
	HeroImageURL  string    `gorm:"column:hero_image_url;type:varchar(500)"`                        // 头图图片
	CoverImageURL string    `gorm:"column:cover_image_url;type:varchar(500)"`                       // 列表封面图
	CategoryID    int64     `gorm:"column:category_id;not null;default:0;index:idx_group_category"` // 所属类目 ID，0 表示暂无类目
	Status        int32     `gorm:"column:status;not null;default:1;index:idx_group_status"`        // 启用状态
	SortOrder     int32     `gorm:"column:sort_order;not null;default:0"`                           // 排序权重
	SpecKeysJSON  string    `gorm:"column:spec_keys_json;type:varchar(1000);not null;default:'[]'"` // 规格维度名称 JSON 数组
	CreatedAt     time.Time `gorm:"column:created_at"`                                              // 创建时间
	UpdatedAt     time.Time `gorm:"column:updated_at"`                                              // 更新时间
}

// TableName 指定商品组表名。
func (ProductGroupModel) TableName() string { return "product_groups" }

// productGroupToDomain 将 GORM 模型转换为领域对象。
func productGroupToDomain(m *ProductGroupModel) *domain.ProductGroup {
	return &domain.ProductGroup{
		ID:            m.ID,
		Name:          m.Name,
		Slug:          m.Slug,
		HeroTitle:     m.HeroTitle,
		HeroSubtitle:  m.HeroSubtitle,
		HeroImageURL:  m.HeroImageURL,
		CoverImageURL: m.CoverImageURL,
		CategoryID:    m.CategoryID,
		Status:        m.Status,
		SortOrder:     m.SortOrder,
		SpecKeys:      decodeSpecKeys(m.SpecKeysJSON),
		CreatedAt:     m.CreatedAt,
		UpdatedAt:     m.UpdatedAt,
	}
}

// ---------- MediaAssetModel ----------

// MediaAssetModel GORM 媒体资源模型。
type MediaAssetModel struct {
	ID         int64     `gorm:"column:id;primaryKey;autoIncrement"`                        // 主键
	StorageKey string    `gorm:"column:storage_key;type:varchar(500);not null;uniqueIndex"` // 内部存储路径
	PublicURL  string    `gorm:"column:public_url;type:varchar(500);not null"`              // 对外访问 URL
	FileName   string    `gorm:"column:file_name;type:varchar(255);not null"`               // 原始文件名
	MIMEType   string    `gorm:"column:mime_type;type:varchar(100);not null"`               // 文件类型
	SizeBytes  int64     `gorm:"column:size_bytes;not null;default:0"`                      // 文件大小
	Width      int32     `gorm:"column:width;not null;default:0"`                           // 宽度
	Height     int32     `gorm:"column:height;not null;default:0"`                          // 高度
	AltText    string    `gorm:"column:alt_text;type:varchar(255);not null;default:''"`     // 替代文本
	CreatedAt  time.Time `gorm:"column:created_at"`                                         // 创建时间
	UpdatedAt  time.Time `gorm:"column:updated_at"`                                         // 更新时间
}

// TableName 指定媒体资源表名。
func (MediaAssetModel) TableName() string { return "media_assets" }

// ---------- ProductGroupMediaBindingModel ----------

// ProductGroupMediaBindingModel GORM 商品组媒体绑定模型。
type ProductGroupMediaBindingModel struct {
	ID        int64           `gorm:"column:id;primaryKey;autoIncrement"`                   // 主键
	GroupID   int64           `gorm:"column:group_id;not null;index:idx_group_media_group"` // 商品组 ID
	MediaID   int64           `gorm:"column:media_id;not null;index:idx_group_media_media"` // 媒体 ID
	UsageType string          `gorm:"column:usage_type;type:varchar(32);not null"`          // 使用场景
	SortOrder int32           `gorm:"column:sort_order;not null;default:0"`                 // 排序
	IsPrimary bool            `gorm:"column:is_primary;not null;default:false"`             // 是否主图
	CreatedAt time.Time       `gorm:"column:created_at"`                                    // 创建时间
	UpdatedAt time.Time       `gorm:"column:updated_at"`                                    // 更新时间
	Media     MediaAssetModel `gorm:"foreignKey:MediaID;references:ID"`                     // 关联媒体
}

// TableName 指定商品组媒体绑定表名。
func (ProductGroupMediaBindingModel) TableName() string { return "product_group_media_bindings" }

// ---------- ProductMediaBindingModel ----------

// ProductMediaBindingModel GORM 独立商品媒体绑定模型。
type ProductMediaBindingModel struct {
	ID        int64           `gorm:"column:id;primaryKey;autoIncrement"`                         // 主键
	ProductID int64           `gorm:"column:product_id;not null;index:idx_product_media_product"` // 商品 ID
	MediaID   int64           `gorm:"column:media_id;not null;index:idx_product_media_media"`     // 媒体 ID
	UsageType string          `gorm:"column:usage_type;type:varchar(32);not null"`                // 使用场景
	SortOrder int32           `gorm:"column:sort_order;not null;default:0"`                       // 排序
	IsPrimary bool            `gorm:"column:is_primary;not null;default:false"`                   // 是否主图
	CreatedAt time.Time       `gorm:"column:created_at"`                                          // 创建时间
	UpdatedAt time.Time       `gorm:"column:updated_at"`                                          // 更新时间
	Media     MediaAssetModel `gorm:"foreignKey:MediaID;references:ID"`                           // 关联媒体
}

// TableName 指定商品媒体绑定表名。
func (ProductMediaBindingModel) TableName() string { return "product_media_bindings" }

// ---------- StockModel ----------

// StockModel GORM 库存模型,与 Product 一对一。
type StockModel struct {
	ID        int64     `gorm:"column:id;primaryKey;autoIncrement"` // 库存主键
	ProductID int64     `gorm:"column:product_id;uniqueIndex"`      // 商品 ID(唯一)
	Quantity  int32     `gorm:"column:quantity;not null;default:0"` // 当前库存
	Version   int32     `gorm:"column:version;not null;default:0"`  // 乐观锁版本号
	UpdatedAt time.Time `gorm:"column:updated_at"`                  // 更新时间
}

// TableName 指定库存表名。
func (StockModel) TableName() string { return "stocks" }

// stockToDomain 将 GORM 模型转换为领域对象。
func stockToDomain(m *StockModel) *domain.Stock {
	return &domain.Stock{
		ID: m.ID, ProductID: m.ProductID, Quantity: m.Quantity,
		Version: m.Version, UpdatedAt: m.UpdatedAt,
	}
}

// ---------- SeckillActivityModel ----------

// SeckillActivityModel GORM 秒杀活动模型。
// 该模型承载秒杀价格、活动库存和活动时间窗等独立于商品主数据的字段。
type SeckillActivityModel struct {
	ID           int64     `gorm:"column:id;primaryKey;autoIncrement"`                // 活动主键
	ProductID    int64     `gorm:"column:product_id;not null;index:idx_product_id"`   // 关联商品 ID
	Title        string    `gorm:"column:title;type:varchar(200);not null"`           // 活动标题
	SeckillPrice int64     `gorm:"column:seckill_price;not null"`                     // 秒杀价(分)
	SeckillStock int32     `gorm:"column:seckill_stock;not null"`                     // 秒杀库存
	Status       int32     `gorm:"column:status;not null;default:1;index:idx_status"` // 活动状态
	StartAt      time.Time `gorm:"column:start_at;not null"`                          // 活动开始时间
	EndAt        time.Time `gorm:"column:end_at;not null"`                            // 活动结束时间
	CreatedAt    time.Time `gorm:"column:created_at"`                                 // 创建时间
	UpdatedAt    time.Time `gorm:"column:updated_at"`                                 // 更新时间
}

// TableName 指定秒杀活动表名。
func (SeckillActivityModel) TableName() string { return "seckill_activities" }

// seckillActivityToDomain 将 GORM 模型转换为领域对象。
func seckillActivityToDomain(m *SeckillActivityModel) *domain.SeckillActivity {
	return &domain.SeckillActivity{
		ID: m.ID, ProductID: m.ProductID, Title: m.Title,
		SeckillPrice: m.SeckillPrice, SeckillStock: m.SeckillStock, Status: m.Status,
		StartAt: m.StartAt, EndAt: m.EndAt,
		CreatedAt: m.CreatedAt, UpdatedAt: m.UpdatedAt,
	}
}

// seckillActivityToModel 将领域对象转换为 GORM 模型。
func seckillActivityToModel(d *domain.SeckillActivity) *SeckillActivityModel {
	return &SeckillActivityModel{
		ID: d.ID, ProductID: d.ProductID, Title: d.Title,
		SeckillPrice: d.SeckillPrice, SeckillStock: d.SeckillStock, Status: d.Status,
		StartAt: d.StartAt, EndAt: d.EndAt,
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt,
	}
}

// mediaAssetToDomain 将媒体模型转换为领域对象。
func mediaAssetToDomain(m *MediaAssetModel) *domain.MediaAsset {
	if m == nil {
		return nil
	}
	return &domain.MediaAsset{
		ID:         m.ID,
		StorageKey: m.StorageKey,
		PublicURL:  m.PublicURL,
		FileName:   m.FileName,
		MIMEType:   m.MIMEType,
		SizeBytes:  m.SizeBytes,
		Width:      m.Width,
		Height:     m.Height,
		AltText:    m.AltText,
		CreatedAt:  m.CreatedAt,
		UpdatedAt:  m.UpdatedAt,
	}
}

// mediaAssetToModel 将媒体领域对象转换为 GORM 模型。
func mediaAssetToModel(d *domain.MediaAsset) *MediaAssetModel {
	return &MediaAssetModel{
		ID:         d.ID,
		StorageKey: d.StorageKey,
		PublicURL:  d.PublicURL,
		FileName:   d.FileName,
		MIMEType:   d.MIMEType,
		SizeBytes:  d.SizeBytes,
		Width:      d.Width,
		Height:     d.Height,
		AltText:    d.AltText,
		CreatedAt:  d.CreatedAt,
		UpdatedAt:  d.UpdatedAt,
	}
}

// productGroupMediaBindingToDomain 将商品组媒体绑定模型转换为领域对象。
func productGroupMediaBindingToDomain(m *ProductGroupMediaBindingModel) domain.ProductGroupMediaBinding {
	return domain.ProductGroupMediaBinding{
		ID:        m.ID,
		GroupID:   m.GroupID,
		MediaID:   m.MediaID,
		UsageType: m.UsageType,
		SortOrder: m.SortOrder,
		IsPrimary: m.IsPrimary,
		Media:     mediaAssetToDomain(&m.Media),
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}

// productGroupMediaBindingToModel 将商品组媒体绑定领域对象转换为 GORM 模型。
func productGroupMediaBindingToModel(d *domain.ProductGroupMediaBinding) *ProductGroupMediaBindingModel {
	return &ProductGroupMediaBindingModel{
		ID:        d.ID,
		GroupID:   d.GroupID,
		MediaID:   d.MediaID,
		UsageType: d.UsageType,
		SortOrder: d.SortOrder,
		IsPrimary: d.IsPrimary,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}

// productMediaBindingToDomain 将独立商品媒体绑定模型转换为领域对象。
func productMediaBindingToDomain(m *ProductMediaBindingModel) domain.ProductMediaBinding {
	return domain.ProductMediaBinding{
		ID:        m.ID,
		ProductID: m.ProductID,
		MediaID:   m.MediaID,
		UsageType: m.UsageType,
		SortOrder: m.SortOrder,
		IsPrimary: m.IsPrimary,
		Media:     mediaAssetToDomain(&m.Media),
		CreatedAt: m.CreatedAt,
		UpdatedAt: m.UpdatedAt,
	}
}

// productMediaBindingToModel 将独立商品媒体绑定领域对象转换为 GORM 模型。
func productMediaBindingToModel(d *domain.ProductMediaBinding) *ProductMediaBindingModel {
	return &ProductMediaBindingModel{
		ID:        d.ID,
		ProductID: d.ProductID,
		MediaID:   d.MediaID,
		UsageType: d.UsageType,
		SortOrder: d.SortOrder,
		IsPrimary: d.IsPrimary,
		CreatedAt: d.CreatedAt,
		UpdatedAt: d.UpdatedAt,
	}
}
