//go:build integration

package cache_test

import (
	"context"
	"os"
	"testing"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yym108/gobao-pkg/cache"
)

// testDB 使用 DB 15 （16 个 DB 里的最后一个， 通常保留给测试），
// 避免污染日常开发用的 DB 0
const testDB = 15

// realRedisAddr 允许通过 REDIS_TEST_ADDR 环境变量覆盖；默认本机
func realRedisAddr() string {
	if addr := os.Getenv("REDIS_TEST_ADDR"); addr != "" {
		return addr
	}
	return "127.0.0.1:6379"
}

// newRealClient 创建真 Redis 客户端，并在测试结束时 FlushDB + Close
func newRealClient(t *testing.T) *redis.Client {
	t.Helper()
	c, err := cache.NewClient(cache.Config{
		Addr: realRedisAddr(),
		DB:   testDB,
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		_ = c.FlushDB(context.Background()).Err()
		_ = c.Close()
	})
	return c
}

func TestIntegration_NewClient_pingOK(t *testing.T) {
	c := newRealClient(t)
	assert.NoError(t, c.Ping(context.Background()).Err())
}

func TestIntegration_LoadScript_runINCR(t *testing.T) {
	c := newRealClient(t)

	script := cache.LoadScript(`return redis.call("INCR", KEYS[1])`)
	ctx := context.Background()

	v1, err := script.Run(ctx, c, []string{"counter"}).Int()
	require.NoError(t, err)
	assert.Equal(t, 1, v1)

	v2, err := script.Run(ctx, c, []string{"counter"}).Int()
	require.NoError(t, err)
	assert.Equal(t, 2, v2)
}

func TestIntegration_LoadScript_reusesSHA(t *testing.T) {
	c := newRealClient(t)

	script := cache.LoadScript(`return 42`)
	_, err := script.Run(context.Background(), c, []string{}).Int()
	require.NoError(t, err)

	exists, err := c.ScriptExists(context.Background(), script.Hash()).Result()
	require.NoError(t, err)
	require.Len(t, exists, 1)
	assert.True(t, exists[0])
}
