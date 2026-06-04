package cache_test

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/yym108/gobao-pkg/cache"
)

func TestNewClient_pingOK(t *testing.T) {
	mr := miniredis.RunT(t)

	c, err := cache.NewClient(cache.Config{Addr: mr.Addr()})
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })

	assert.NoError(t, c.Ping(context.Background()).Err())
}

func TestNewClient_unreachable(t *testing.T) {
	_, err := cache.NewClient(cache.Config{Addr: "127.0.0.1:1"})
	require.Error(t, err, "连接失败必须返回非 nil error")
}

func TestLoadScript(t *testing.T) {
	mr := miniredis.RunT(t)

	c, err := cache.NewClient(cache.Config{Addr: mr.Addr()})
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })

	script := cache.LoadScript(`return redis.call("INCR", KEYS[1])`)

	ctx := context.Background()
	v1, err := script.Run(ctx, c, []string{"counter"}).Int()
	require.NoError(t, err)
	assert.Equal(t, 1, v1)

	v2, err := script.Run(ctx, c, []string{"counter"}).Int()
	require.NoError(t, err)
	assert.Equal(t, 2, v2, "再次 Run 应累加到 2")
}

func TestLoadScript_reusesSHA(t *testing.T) {
	mr := miniredis.RunT(t)

	c, err := cache.NewClient(cache.Config{Addr: mr.Addr()})
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })

	script := cache.LoadScript(`return 42`)

	v, err := script.Run(context.Background(), c, []string{}).Int()
	require.NoError(t, err)
	assert.Equal(t, 42, v)

	exists, err := c.ScriptExists(context.Background(), script.Hash()).Result()
	require.NoError(t, err)
	require.Len(t, exists, 1)
	assert.True(t, exists[0], "脚本的 SHA 应已被 Redis 缓存")
}
