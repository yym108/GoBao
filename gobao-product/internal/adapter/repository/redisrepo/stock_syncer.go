package redisrepo

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// QuantityWriter 是库存回写的窄接口:把某商品的权威库存数量写入底层备份(MySQL)。
// 单独定义而不复用 domain.StockRepository,是为了不污染领域接口(避免所有实现都新增方法),
// 由 mysql.StockRepo 额外实现即可。
type QuantityWriter interface {
	// SyncQuantity 覆盖式写入备份数量(不做 CAS、不动 version)。
	SyncQuantity(ctx context.Context, productID int64, quantity int32) error
}

// StockSyncer 定时把 Redis 权威库存回写 MySQL 备份。
// 设计动机:库存真值在 Redis,正常运行时 MySQL 的 quantity 是陈旧值;
// 若 Redis 整库丢数据后重启,会用 MySQL 旧值重新预热,导致已售出的量被"还原"。
// 周期性回写让 MySQL 备份持续逼近真值,把这种回退误差收敛到一个同步周期以内。
type StockSyncer struct {
	rdb      *goredis.Client // Redis 客户端,用于 SCAN/GET 库存键
	writer   QuantityWriter  // 备份写入端(MySQL)
	interval time.Duration   // 回写周期
	onResult func(int, error) // 每轮回写结果回调(注入日志),可为 nil
}

// NewStockSyncer 构造库存回写同步器。
//   - rdb: Redis 客户端
//   - writer: 备份写入端(通常为 mysql.StockRepo)
//   - interval: 回写周期(如 1 分钟)
func NewStockSyncer(rdb *goredis.Client, writer QuantityWriter, interval time.Duration) *StockSyncer {
	return &StockSyncer{rdb: rdb, writer: writer, interval: interval}
}

// WithResultHook 注入每轮回写的结果回调(用于打日志),返回自身以便链式调用。
func (s *StockSyncer) WithResultHook(fn func(synced int, err error)) *StockSyncer {
	s.onResult = fn
	return s
}

// Run 阻塞运行回写循环,直到 ctx 取消;退出前再做一次 flush 尽量减少丢失。
// 通常以 go s.Run(ctx) 方式在后台启动。
func (s *StockSyncer) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			// ctx 已取消,用一个独立的后台 ctx 做最后一次回写(否则 SCAN 会因 ctx 取消立即失败)。
			n, err := s.syncOnce(context.Background())
			s.report(n, err)
			return
		case <-ticker.C:
			n, err := s.syncOnce(ctx)
			s.report(n, err)
		}
	}
}

// report 调用结果回调(若已注入)。
func (s *StockSyncer) report(n int, err error) {
	if s.onResult != nil {
		s.onResult(n, err)
	}
}

// syncOnce 扫描一遍所有库存键并回写,返回成功回写的条数。
// 使用 SCAN(游标式、非阻塞)而非 KEYS,避免在键多时阻塞 Redis。
func (s *StockSyncer) syncOnce(ctx context.Context) (int, error) {
	var cursor uint64
	synced := 0
	for {
		keys, next, err := s.rdb.Scan(ctx, cursor, stockKeyPrefix+"*", 200).Result()
		if err != nil {
			return synced, err
		}
		for _, key := range keys {
			productID, perr := productIDFromKey(key)
			if perr != nil {
				continue // 键名不符合 product:stock:{id} 形态,跳过
			}
			qty, gerr := s.rdb.Get(ctx, key).Int()
			if gerr != nil {
				if errors.Is(gerr, goredis.Nil) {
					continue // 扫描与读取之间键已过期/被删,跳过
				}
				return synced, gerr
			}
			if werr := s.writer.SyncQuantity(ctx, productID, int32(qty)); werr != nil {
				return synced, werr
			}
			synced++
		}
		cursor = next
		if cursor == 0 {
			break // 游标回到 0 表示遍历完成
		}
	}
	return synced, nil
}

// productIDFromKey 从库存键 product:stock:{id} 解析出商品 ID。
func productIDFromKey(key string) (int64, error) {
	return strconv.ParseInt(strings.TrimPrefix(key, stockKeyPrefix), 10, 64)
}
