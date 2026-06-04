package idempotency

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestClient(t *testing.T) *redis.Client {
	t.Helper()
	mr := miniredis.RunT(t)
	return redis.NewClient(&redis.Options{Addr: mr.Addr()})
}

func TestAcquire_firstTime(t *testing.T) {
	rdb := newTestClient(t)
	g := New(rdb, "test:")

	ok, err := g.Acquire(context.Background(), "req-1", time.Minute)
	require.NoError(t, err)
	assert.True(t, ok)
}

func TestAcquire_duplicate(t *testing.T) {
	rdb := newTestClient(t)
	g := New(rdb, "test:")
	ctx := context.Background()

	ok1, err := g.Acquire(ctx, "req-1", time.Minute)
	require.NoError(t, err)
	assert.True(t, ok1)

	ok2, err := g.Acquire(ctx, "req-1", time.Minute)
	require.NoError(t, err)
	assert.False(t, ok2, "重复请求应返回 false")
}

func TestAcquire_differentKeys(t *testing.T) {
	rdb := newTestClient(t)
	g := New(rdb, "test:")
	ctx := context.Background()

	ok1, _ := g.Acquire(ctx, "req-1", time.Minute)
	ok2, _ := g.Acquire(ctx, "req-2", time.Minute)
	assert.True(t, ok1)
	assert.True(t, ok2, "不同 key 互不影响")
}

func TestAcquire_expire(t *testing.T) {
	mr := miniredis.RunT(t)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	g := New(rdb, "test:")
	ctx := context.Background()

	_, _ = g.Acquire(ctx, "req-1", 2*time.Second)

	mr.FastForward(3 * time.Second)

	ok, err := g.Acquire(ctx, "req-1", 2*time.Second)
	require.NoError(t, err)
	assert.True(t, ok, "过期后应允许重新获取")
}
