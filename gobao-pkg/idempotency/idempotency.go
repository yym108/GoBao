// Package idempotency 提供基于 Redis SETNX 的幂等守卫
// 用于拦截重复请求（秒杀下单、消息消费、webhook 回调等场景）
package idempotency

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// Guard 是一个幂等守卫。 每个业务场景建议用独立的 prefix
// 构造一个 Guard，避免 key 冲突
type Guard struct {
	rdb    *redis.Client
	prefix string
}

// New 构造一个 Guard。 prefix 会被拼在业务传入的 key 前面
func New(rdb *redis.Client, prefix string) *Guard {
	return &Guard{rdb: rdb, prefix: prefix}
}

// Acquire 尝试占用幂等 key
//
// 返回 true  —— 首次到达，调用方应继续执行业务；
// 返回 false —— key 已被占用（重复请求），调用方应直接返回已有结果或拒绝
//
// ttl 决定幂等窗口：过短会误判同一请求为两次，过长会占内存
// 一般用业务的”最长重试周期 + 冗余“作为取值依据
func (g *Guard) Acquire(ctx context.Context, key string, ttl time.Duration) (bool, error) {
	err := g.rdb.SetArgs(ctx, g.prefix+key, "1", redis.SetArgs{
		Mode: "NX",
		TTL:  ttl,
	}).Err()
	if errors.Is(err, redis.Nil) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
