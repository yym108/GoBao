// Package redisrepo 提供以 Redis 为权威库存的库存仓储实现。
// 下单热路径(Deduct/Restore)只走 Redis Lua 原子操作,不再写 MySQL 那一行,
// 从而消除"单热点商品库存行锁"的吞吐天花板;MySQL 退化为种子/备份与后台展示来源。
package redisrepo

import (
	"context"
	"errors"
	"fmt"

	goredis "github.com/redis/go-redis/v9"

	"github.com/yym108/gobao-product/internal/domain"
)

// stockKeyPrefix 是 Redis 库存键前缀,键形如 product:stock:1001001。
const stockKeyPrefix = "product:stock:"

func stockKey(productID int64) string {
	return fmt.Sprintf("%s%d", stockKeyPrefix, productID)
}

// deductScript 原子"判库存→扣减"。
// 返回:-2 键不存在(未预热);-1 库存不足;>=0 扣减后剩余。
var deductScript = goredis.NewScript(`
local cur = redis.call('GET', KEYS[1])
if not cur then return -2 end
cur = tonumber(cur)
local q = tonumber(ARGV[1])
if cur < q then return -1 end
return redis.call('DECRBY', KEYS[1], q)
`)

// restoreScript 原子回补。返回:-2 键不存在;否则回补后数量。
var restoreScript = goredis.NewScript(`
local cur = redis.call('GET', KEYS[1])
if not cur then return -2 end
return redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))
`)

// StockStore 以 Redis 为权威的库存仓储,实现 domain.StockRepository。
// inner 为底层 MySQL 仓储:用于库存种子、版本号、后台设置与冷数据回源。
type StockStore struct {
	rdb   *goredis.Client
	inner domain.StockRepository
}

// NewStockStore 构造 Redis 权威库存仓储。
func NewStockStore(rdb *goredis.Client, inner domain.StockRepository) *StockStore {
	return &StockStore{rdb: rdb, inner: inner}
}

// seedFromInner 在 Redis 缺键时,用 MySQL 当前库存做一次性预热(SETNX,避免覆盖已有真值)。
// 返回是否成功预热(商品/库存不存在时返回 false)。
func (s *StockStore) seedFromInner(ctx context.Context, productID int64) (bool, error) {
	st, err := s.inner.FindByProductID(ctx, productID)
	if err != nil {
		return false, err
	}
	if st == nil {
		return false, nil
	}
	if err := s.rdb.SetNX(ctx, stockKey(productID), st.Quantity, 0).Err(); err != nil {
		return false, err
	}
	return true, nil
}

// Create 创建库存:先落 MySQL,再把初始库存预热进 Redis。
func (s *StockStore) Create(ctx context.Context, st *domain.Stock) error {
	if err := s.inner.Create(ctx, st); err != nil {
		return err
	}
	return s.rdb.SetNX(ctx, stockKey(st.ProductID), st.Quantity, 0).Err()
}

// FindByProductID 读取库存:数量以 Redis 为准(实时),版本号沿用 MySQL;Redis 缺键时回退 MySQL 数量。
func (s *StockStore) FindByProductID(ctx context.Context, productID int64) (*domain.Stock, error) {
	st, err := s.inner.FindByProductID(ctx, productID)
	if err != nil || st == nil {
		return st, err
	}
	q, gerr := s.rdb.Get(ctx, stockKey(productID)).Int()
	if gerr == nil {
		st.Quantity = int32(q)
	} else if !errors.Is(gerr, goredis.Nil) {
		return nil, gerr
	}
	return st, nil
}

// Deduct 原子扣减:仅在 Redis 上 Lua 判扣;缺键时回源 MySQL 预热后重试;库存不足/不存在映射为 ErrStockCASConflict。
func (s *StockStore) Deduct(ctx context.Context, productID int64, quantity int32) (int32, error) {
	res, err := deductScript.Run(ctx, s.rdb, []string{stockKey(productID)}, quantity).Int64()
	if err != nil {
		return 0, err
	}
	if res == -2 {
		ok, serr := s.seedFromInner(ctx, productID)
		if serr != nil {
			return 0, serr
		}
		if !ok {
			return 0, domain.ErrStockCASConflict
		}
		res, err = deductScript.Run(ctx, s.rdb, []string{stockKey(productID)}, quantity).Int64()
		if err != nil {
			return 0, err
		}
	}
	if res < 0 {
		return 0, domain.ErrStockCASConflict
	}
	return int32(res), nil
}

// Restore 原子回补:Redis INCRBY;缺键时先回源预热再重试。
func (s *StockStore) Restore(ctx context.Context, productID int64, quantity int32) (int32, error) {
	res, err := restoreScript.Run(ctx, s.rdb, []string{stockKey(productID)}, quantity).Int64()
	if err != nil {
		return 0, err
	}
	if res == -2 {
		ok, serr := s.seedFromInner(ctx, productID)
		if serr != nil {
			return 0, serr
		}
		if !ok {
			return 0, domain.ErrStockCASConflict
		}
		res, err = restoreScript.Run(ctx, s.rdb, []string{stockKey(productID)}, quantity).Int64()
		if err != nil {
			return 0, err
		}
	}
	return int32(res), nil
}

// SetQuantity 后台直接设置库存:先按 MySQL 的版本号 CAS 落库,成功后把 Redis 覆盖为新值。
func (s *StockStore) SetQuantity(ctx context.Context, productID int64, quantity int32, expectedVersion int32) error {
	if err := s.inner.SetQuantity(ctx, productID, quantity, expectedVersion); err != nil {
		return err
	}
	return s.rdb.Set(ctx, stockKey(productID), quantity, 0).Err()
}