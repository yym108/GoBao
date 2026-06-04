package domain

import (
	"context"
	"errors"
)

// ProductRepository 商品仓储接口,application 层依赖此抽象。
// FindByID 未找到时返回 (nil, nil),由 application 决定语义(NotFound)。
type ProductRepository interface {
	// Create 持久化商品并回填 ID/CreatedAt/UpdatedAt。
	Create(ctx context.Context, p *Product) error
	// FindByID 按主键查询,未找到返回 (nil, nil),已软删除视为不存在。
	FindByID(ctx context.Context, id int64) (*Product, error)
	// List 分页查询,categoryID=0 表示不过滤;返回当前页数据 + 总数。
	List(ctx context.Context, categoryID int64, page, pageSize int) ([]*Product, int64, error)
	// Update 全量更新非主键字段,UpdatedAt 由 GORM 自动维护。
	Update(ctx context.Context, p *Product) error
	// SoftDelete 设置 deleted_at 为当前时间。
	SoftDelete(ctx context.Context, id int64) error
}

// ProductGroupRepository 商品组仓储接口。
// 该接口负责商品家族展示层的读取与聚合，不参与库存与交易真值计算。
type ProductGroupRepository interface {
	// FindByID 按商品组主键查询，未找到返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*ProductGroup, error)
	// List 按类目分页查询商品组列表，categoryID=0 表示不过滤。
	List(ctx context.Context, categoryID int64, page, pageSize int) ([]ProductGroup, int64, error)
	// ListProductsByGroupID 查询同一商品组下的独立商品列表，按 sort_order 升序返回。
	ListProductsByGroupID(ctx context.Context, groupID int64) ([]*Product, error)
	// Create 创建商品组并回填主键与时间。
	Create(ctx context.Context, group *ProductGroup) error
	// Update 更新商品组基础展示字段。
	Update(ctx context.Context, group *ProductGroup) error
	// Delete 删除商品组。
	Delete(ctx context.Context, id int64) error
	// ExistsBySlug 校验 slug 是否已存在；excludeID>0 时排除自身。
	ExistsBySlug(ctx context.Context, slug string, excludeID int64) (bool, error)
	// CountProductsByGroupID 统计某个商品组下的独立商品数量。
	CountProductsByGroupID(ctx context.Context, groupID int64) (int64, error)
	// CountByCategoryID 统计某个类目下的商品组数量。
	CountByCategoryID(ctx context.Context, categoryID int64) (int64, error)
	// ClearCategoryByCategoryID 将某个类目下的全部商品组置为暂无类目。
	ClearCategoryByCategoryID(ctx context.Context, categoryID int64) error
}

// MediaAssetRepository 媒体资源仓储接口。
type MediaAssetRepository interface {
	// Create 创建媒体资源并回填主键与时间字段。
	Create(ctx context.Context, asset *MediaAsset) error
	// FindByID 按主键查询媒体资源，未找到返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*MediaAsset, error)
}

// ProductGroupMediaRepository 商品组媒体绑定仓储接口。
type ProductGroupMediaRepository interface {
	// ListByGroupID 查询某个商品组下的全部媒体绑定。
	ListByGroupID(ctx context.Context, groupID int64) ([]ProductGroupMediaBinding, error)
	// Create 创建一条商品组媒体绑定。
	Create(ctx context.Context, binding *ProductGroupMediaBinding) error
	// Update 更新某条商品组媒体绑定的用途、排序与主图标记。
	Update(ctx context.Context, binding *ProductGroupMediaBinding) error
	// Delete 删除某个商品组上的一条媒体绑定。
	Delete(ctx context.Context, groupID int64, bindingID int64) error
}

// ProductMediaRepository 独立商品媒体绑定仓储接口。
type ProductMediaRepository interface {
	// ListByProductID 查询某个独立商品下的全部媒体绑定。
	ListByProductID(ctx context.Context, productID int64) ([]ProductMediaBinding, error)
	// Create 创建一条独立商品媒体绑定。
	Create(ctx context.Context, binding *ProductMediaBinding) error
	// Update 更新某条独立商品媒体绑定的用途、排序与主图标记。
	Update(ctx context.Context, binding *ProductMediaBinding) error
	// Delete 删除某个独立商品上的一条媒体绑定。
	Delete(ctx context.Context, productID int64, bindingID int64) error
}

// CategoryRepository 类目仓储接口。
type CategoryRepository interface {
	// Create 创建类目,名称重复由数据库 UNIQUE 约束捕获,application 层转 ALREADY_EXISTS。
	Create(ctx context.Context, c *Category) error
	// FindByID 按主键查询,未找到返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*Category, error)
	// List 全量查询,按 sort_order 升序、id 升序。
	List(ctx context.Context) ([]*Category, error)
	// Update 更新名称与排序权重。
	Update(ctx context.Context, c *Category) error
	// Delete 物理删除(类目无软删除需求)。
	Delete(ctx context.Context, id int64) error
	// ExistsByName 校验名称是否已存在;excludeID>0 时排除该 ID(用于更新场景)。
	ExistsByName(ctx context.Context, name string, excludeID int64) (bool, error)
}

// StockRepository 库存仓储接口。
// Deduct/Restore 内部使用 CAS(WHERE quantity>=? AND version=?),
// 影响行数为 0 时返回 ErrStockCASConflict 由 application 转换错误码。
type StockRepository interface {
	// Create 创建库存记录,与商品创建在同一事务内执行。
	Create(ctx context.Context, s *Stock) error
	// FindByProductID 按商品 ID 查询,未找到返回 (nil, nil)。
	FindByProductID(ctx context.Context, productID int64) (*Stock, error)
	// Deduct 原子扣减:WHERE quantity>=? AND version=?,影响行数 0 → ErrStockCASConflict。
	// 返回扣减后剩余库存。
	Deduct(ctx context.Context, productID int64, quantity int32) (int32, error)
	// Restore 原子回补:版本+1,quantity+= 增量;同样 CAS,影响行数 0 → ErrStockCASConflict。
	Restore(ctx context.Context, productID int64, quantity int32) (int32, error)
	// SetQuantity 直接设置库存数量(商家后台一键修改上架数量)。
	// expectedVersion 为商家读取时的版本号,版本不匹配 → ErrStockCASConflict,商家应刷新后重试。
	SetQuantity(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error
}

// SeckillActivityRepository 秒杀活动仓储接口。
type SeckillActivityRepository interface {
	// Create 创建秒杀活动并回填主键与时间字段。
	Create(ctx context.Context, a *SeckillActivity) error
	// FindByID 按主键查询活动，未找到返回 (nil, nil)。
	FindByID(ctx context.Context, id int64) (*SeckillActivity, error)
	// Update 更新活动字段。
	Update(ctx context.Context, a *SeckillActivity) error
}

// ErrStockCASConflict CAS 失败的哨兵错误,application 层捕获后转 ABORTED/FAILED_PRECONDITION。
var ErrStockCASConflict = errors.New("stock CAS conflict: version mismatch or insufficient quantity")
