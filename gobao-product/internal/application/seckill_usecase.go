// Package application 编排领域对象与仓储,把业务规则转换成仓储调用。
// 此层不依赖任何 RPC/HTTP 框架,错误统一通过 pkgerrors.New(Code, msg) 表达。
package application

import (
	"context"
	"fmt"
	"time"

	pkgerrors "github.com/yym108/gobao-pkg/errors"
	"github.com/yym108/gobao-product/internal/domain"
)

// SeckillRedisStore 抽象秒杀预热写入 Redis 的最小能力。
type SeckillRedisStore interface {
	// Set 将 value 写入指定 key，并设置过期时间。
	Set(ctx context.Context, key string, value any, ttl time.Duration) error
}

// SeckillUseCase 负责秒杀活动查询与预热编排。
type SeckillUseCase struct {
	prodRepo domain.ProductRepository         // 商品仓储，用于校验商品存在
	actRepo  domain.SeckillActivityRepository // 秒杀活动仓储
	store    SeckillRedisStore                // Redis 预热写入能力
	nowFn    func() time.Time                 // 当前时间函数，便于测试替换
}

// NewSeckillUseCase 构造秒杀活动用例。
//   - prodRepo: 商品仓储，用于校验活动绑定商品是否存在
//   - actRepo: 秒杀活动仓储
//   - store: Redis 预热写入能力
func NewSeckillUseCase(
	prodRepo domain.ProductRepository,
	actRepo domain.SeckillActivityRepository,
	store SeckillRedisStore,
) *SeckillUseCase {
	return &SeckillUseCase{
		prodRepo: prodRepo,
		actRepo:  actRepo,
		store:    store,
		nowFn:    time.Now,
	}
}

// Get 按 ID 查询秒杀活动。
// 未找到时返回 CodeNotFound。
func (uc *SeckillUseCase) Get(ctx context.Context, id int64) (*domain.SeckillActivity, error) {
	act, err := uc.actRepo.FindByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if act == nil {
		return nil, pkgerrors.New(pkgerrors.CodeNotFound, "秒杀活动不存在")
	}
	return act, nil
}

// Prewarm 将秒杀活动元信息与库存写入 Redis。
// 返回写入的 meta key 与 stock key，供调用方记录或调试。
func (uc *SeckillUseCase) Prewarm(ctx context.Context, id int64) (metaKey, stockKey string, err error) {
	act, err := uc.Get(ctx, id)
	if err != nil {
		return "", "", err
	}

	prod, err := uc.prodRepo.FindByID(ctx, act.ProductID)
	if err != nil {
		return "", "", err
	}
	if prod == nil {
		return "", "", pkgerrors.New(pkgerrors.CodeFailedPrecondition, "秒杀活动关联商品不存在")
	}
	if act.Status != domain.SeckillStatusActive {
		return "", "", pkgerrors.New(pkgerrors.CodeFailedPrecondition, "秒杀活动未激活")
	}
	if !act.EndAt.After(uc.nowFn()) {
		return "", "", pkgerrors.New(pkgerrors.CodeFailedPrecondition, "秒杀活动已结束")
	}

	metaKey = fmt.Sprintf("seckill:activity:%d:meta", act.ID)
	stockKey = fmt.Sprintf("seckill:activity:%d:stock", act.ID)

	ttl := act.EndAt.Sub(uc.nowFn())
	if ttl <= 0 {
		return "", "", pkgerrors.New(pkgerrors.CodeFailedPrecondition, "秒杀活动已结束")
	}

	meta := map[string]any{
		"activity_id":   act.ID,
		"product_id":    act.ProductID,
		"title":         act.Title,
		"seckill_price": act.SeckillPrice,
		"seckill_stock": act.SeckillStock,
		"status":        act.Status,
		"start_at":      act.StartAt.Unix(),
		"end_at":        act.EndAt.Unix(),
	}
	if err := uc.store.Set(ctx, metaKey, meta, ttl); err != nil {
		return "", "", err
	}
	if err := uc.store.Set(ctx, stockKey, act.SeckillStock, ttl); err != nil {
		return "", "", err
	}
	return metaKey, stockKey, nil
}
