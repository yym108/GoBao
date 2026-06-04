package mysql

import (
	"context"
	"database/sql"
	"errors"
	"reflect"

	"gorm.io/gorm"

	"github.com/yym108/gobao-product/internal/domain"
)

// StockRepo 库存仓储 GORM 实���,Deduct/Restore 内部使用 CAS 乐观锁。
type StockRepo struct {
	db *gorm.DB // GORM 数据库连接
}

// NewStockRepo 构造函数。
//   - db: 应用级根 GORM DB,不要传入事务 tx 做共享依赖
func NewStockRepo(db *gorm.DB) *StockRepo {
	if isTransactionScopedDB(db) {
		panic("mysql.StockRepo requires a root *gorm.DB, not a transaction-scoped tx")
	}
	return &StockRepo{db: db}
}

func isTransactionScopedDB(db *gorm.DB) bool {
	if db == nil || db.Statement == nil || db.Statement.ConnPool == nil {
		return false
	}
	if _, ok := db.Statement.ConnPool.(*sql.Tx); ok {
		return true
	}
	committer, ok := db.Statement.ConnPool.(gorm.TxCommitter)
	if !ok || committer == nil {
		return false
	}

	value := reflect.ValueOf(committer)
	if value.Kind() == reflect.Pointer && value.IsNil() {
		return false
	}
	return true
}

// Create 创建库存记录,成功后回填 ID。
//   - ctx: 上下文
//   - s: 领域库存对象
func (r *StockRepo) Create(ctx context.Context, s *domain.Stock) error {
	m := &StockModel{ProductID: s.ProductID, Quantity: s.Quantity, Version: s.Version}
	if err := r.db.WithContext(ctx).Create(m).Error; err != nil {
		return err
	}
	s.ID = m.ID
	return nil
}

// FindByProductID 按商品 ID 查询库存,未找到返回 (nil, nil)。
//   - ctx: 上下文
//   - productID: 商品 ID
func (r *StockRepo) FindByProductID(ctx context.Context, productID int64) (*domain.Stock, error) {
	var m StockModel
	if err := r.db.WithContext(ctx).Where("product_id = ?", productID).First(&m).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return stockToDomain(&m), nil
}

// Deduct 原子扣减库存:单条条件 UPDATE(WHERE quantity>=?),由数据库行锁串行化。
// 相比"读版本→版本 CAS→重试"的乐观锁,该方式在同一商品高并发下不会因版本冲突大量失败,
// 只要库存仍然充足即可成功;影响行数为 0 表示库存不足或商品不存在,返回 ErrStockCASConflict。
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 扣减数量
func (r *StockRepo) Deduct(ctx context.Context, productID int64, quantity int32) (int32, error) {
	res := r.db.WithContext(ctx).Model(&StockModel{}).
		Where("product_id = ? AND quantity >= ?", productID, quantity).
		Updates(map[string]any{
			"quantity": gorm.Expr("quantity - ?", quantity),
			"version":  gorm.Expr("version + 1"),
		})
	if res.Error != nil {
		return 0, res.Error
	}
	if res.RowsAffected == 0 {
		// 库存不足或商品不存在,沿用既有错误语义。
		return 0, domain.ErrStockCASConflict
	}

	// 扣减成功后读回剩余库存供调用方展示;该读取不影响扣减的原子性。
	var m StockModel
	if err := r.db.WithContext(ctx).Where("product_id = ?", productID).First(&m).Error; err != nil {
		return 0, err
	}
	return m.Quantity, nil
}

// Restore 原子回补库存,CAS 方式:version+1, quantity+=增量。
// 影响行数为 0 时返回 ErrStockCASConflict。
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 回补数量
func (r *StockRepo) Restore(ctx context.Context, productID int64, quantity int32) (int32, error) {
	return r.casUpdate(ctx, productID, quantity, false)
}

// casMaxRetries CAS 最大重试次数,防止高并发下饥饿。
const casMaxRetries = 3

// casUpdate 统一的 CAS 更新逻辑。
// 流程:读取当前版本 → 计算新数量 → WHERE version=? 条件更新 → 影响行数判定。
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: 变动数量
//   - deduct: true=扣减 false=回补
func (r *StockRepo) casUpdate(ctx context.Context, productID int64, quantity int32, deduct bool) (int32, error) {
	for i := 0; i < casMaxRetries; i++ {
		var m StockModel
		if err := r.db.WithContext(ctx).Where("product_id = ?", productID).First(&m).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return 0, domain.ErrStockCASConflict
			}
			return 0, err
		}
		var newQty int32
		if deduct {
			newQty = m.Quantity - quantity
			if newQty < 0 {
				return 0, domain.ErrStockCASConflict
			}
		} else {
			newQty = m.Quantity + quantity
		}
		res := r.db.WithContext(ctx).Model(&StockModel{}).
			Where("product_id = ? AND version = ?", productID, m.Version).
			Updates(map[string]any{"quantity": newQty, "version": m.Version + 1})
		if res.Error != nil {
			return 0, res.Error
		}
		if res.RowsAffected == 1 {
			return newQty, nil
		}
	}
	return 0, domain.ErrStockCASConflict
}

// SyncQuantity 将 Redis 权威库存回写到 MySQL 备份(由定时同步器调用)。
// 直接覆盖 quantity,不做 version CAS、也不递增 version:
// 该操作只同步"备份/展示值",version 仍服务于后台 SetQuantity 的乐观锁语义。
// 商品不存在时影响 0 行,视为正常(无需回写),返回 nil。
//   - ctx: 上下文
//   - productID: 商品 ID
//   - quantity: Redis 当前实时库存
func (r *StockRepo) SyncQuantity(ctx context.Context, productID int64, quantity int32) error {
	return r.db.WithContext(ctx).Model(&StockModel{}).
		Where("product_id = ?", productID).
		Update("quantity", quantity).Error
}

// SetQuantity 直接设置库存数量(商家后台一键修改上架数量)。
// 单次 CAS:用商家读取时的 expectedVersion 做条件更新,版本不匹配直接失败,
// 避免内部重试覆盖并发扣减导致超卖。
func (r *StockRepo) SetQuantity(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error {
	res := r.db.WithContext(ctx).Model(&StockModel{}).
		Where("product_id = ? AND version = ?", productID, expectedVersion).
		Updates(map[string]any{"quantity": quantity, "version": expectedVersion + 1})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return domain.ErrStockCASConflict
	}
	return nil
}
