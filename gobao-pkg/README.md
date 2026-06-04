# gobao-pkg

GoBao 的共享基础库仓库，放置所有服务都会复用的通用能力。

## 作用

- 认证与 JWT
- 配置读取
- 日志
- gRPC / HTTP 辅助
- Redis / NATS / 幂等等共用工具

## 关系

- 被 `gobao-user`、`gobao-product`、`gobao-order`、`gobao-payment`、`gobao-gateway` 共同依赖

## 目录重点

- `authn/`：JWT、密码哈希
- `cache/`：Redis 辅助封装
- `config/`：环境变量配置加载
- `grpcx/`：gRPC 公共拦截器
- `httpx/`：HTTP 中间件辅助
- `idempotency/`：幂等工具
- `logger/`：日志装配
- `mq/`：NATS / JetStream 辅助能力
- `server/`：公共 server 启动包装

## 环境变量

大多数单元测试不依赖外部环境。若执行集成测试，可参考仓库根目录 `.env.example` 配置 Redis / NATS 地址。

## 常用命令

```bash
go test ./...
go build ./...
```
