// Package config 定义 Product 服务的配置结构。
// 通过 mapstructure tag 支持 viper 从环境变量加载（前缀 PRODUCT_）。
package config

// Config 是 Product 服务的完整配置。
type Config struct {
	HTTPAddr     string `mapstructure:"http_addr"`      // HTTP 监听地址，如 ":8080"
	GRPCAddr     string `mapstructure:"grpc_addr"`      // gRPC 监听地址，如 ":9090"
	LogLevel     string `mapstructure:"log_level"`      // 日志级别：debug/info/warn/error
	MySQLDSN     string `mapstructure:"mysql_dsn"`      // MySQL 连接串，指向 product 库
	RedisAddr    string `mapstructure:"redis_addr"`     // Redis 地址，用于秒杀活动预热与缓存写入
	RedisDB      int    `mapstructure:"redis_db"`       // Redis 数据库编号，默认使用 0
	MediaRoot    string `mapstructure:"media_root"`     // 商品媒体文件根目录
	MediaBaseURL string `mapstructure:"media_base_url"` // 商品媒体对外访问前缀
}
