// Package cache 提供统一的 Redis 客户端工厂与 Lua 脚本加载器，
// 项目内所有需要 Redis 的服务（秒杀、session、幂等、热点缓存）都复用这里。
package cache

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// Config 描述一个 Redis 实例的连接参数
// 字段 Tag 以 config 包的 mapstructure 约定对其，方便从 env/yaml 中加载
type Config struct {
	Addr     string `mapstructure:"addr"`      // host:port, 如"localhost:6379"
	Password string `mapstructure:"password"`  // 无密码则留空
	DB       int    `mapstructure:"db"`        // DB 编号（默认0）
	PoolSize int    `mapstructure:"pool_size"` // 连接池大小； 0 使用 go-redis 默认值
}

// NewClient 按 cfg 创建 go-redis 客户端并 Ping 验证连通
//
// # DialTimeout 统一设定为 2 秒——防止 Redis 挂掉时服务启动被卡死
//
// 返回的 *redis.Client 可直接交由业务代码使用； 服务退出时调用者Close()  (通常使用defer)
func NewClient(cfg Config) (*redis.Client, error) {
	c := redis.NewClient(&redis.Options{
		Addr:        cfg.Addr,
		Password:    cfg.Password,
		DB:          cfg.DB,
		PoolSize:    cfg.PoolSize,
		DialTimeout: 2 * time.Second,
	})

	if err := c.Ping(context.Background()).Err(); err != nil {
		_ = c.Close()
		return nil, err
	}
	return c, nil
}

// LoadScript 把 Lua 源码包装成可复用的脚本对象。
//
// 内部使用 go-redis 的 NewScript，自动处理 EVALSHA 缓存与 EVAL 回退——
// 调用方第一次 Run 时会 SCRIPT LOAD，后续仅用 SHA1 发请求，省带宽。
//
// 典型用法：
//
//	var stockDeduct = cache.LoadScript(`
//	  if tonumber(redis.call("GET", KEYS[1])) > 0 then
//	    return redis.call("DECR", KEYS[1])
//	  end
//	  return -1
//	`)
//	// 在请求处理中：
//	n, err := stockDeduct.Run(ctx, rdb, []string{"stock:123"}).Int()
func LoadScript(src string) *redis.Script {
	return redis.NewScript(src)
}
