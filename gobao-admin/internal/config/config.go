// Package config 定义 Admin 服务的配置结构。
// 通过 mapstructure tag 支持 viper 从环境变量加载（前缀 ADMIN_）。
package config

// Config 是 Admin 服务的完整配置。
type Config struct {
	HTTPAddr  string `mapstructure:"http_addr"`  // HTTP 监听地址，如 ":8080"
	GRPCAddr  string `mapstructure:"grpc_addr"`  // gRPC 监听地址，如 ":9090"
	LogLevel  string `mapstructure:"log_level"`  // 日志级别：debug/info/warn/error
	MySQLDSN  string `mapstructure:"mysql_dsn"`  // MySQL 连接字符串
	JWTSecret string `mapstructure:"jwt_secret"` // JWT 签名密钥（需与 Gateway 保持一致）
	JWTExpiry string `mapstructure:"jwt_expiry"` // JWT 有效期字符串，如 "24h"
}
