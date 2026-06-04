# GoBao 环境变量说明

## 根目录 `.env`

根目录 `.env` 主要给 `gobao-deploy/docker-compose.yml` 使用。

默认端口如下：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MYSQL_USER_PORT` | `3307` | User 服务 MySQL 对宿主机暴露端口 |
| `MYSQL_PRODUCT_PORT` | `3308` | Product 服务 MySQL 对宿主机暴露端口 |
| `MYSQL_ORDER_PORT` | `3309` | Order 服务 MySQL 对宿主机暴露端口 |
| `MYSQL_PAYMENT_PORT` | `3310` | Payment 服务 MySQL 对宿主机暴露端口 |
| `MYSQL_GATEWAY_PORT` | `3311` | Gateway 购物车 MySQL 对宿主机暴露端口 |
| `MYSQL_ADMIN_PORT` | `3312` | Admin 服务 MySQL 对宿主机暴露端口 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `NATS_PORT` | `4222` | NATS 客户端端口 |
| `NATS_MONITOR_PORT` | `8222` | NATS 监控端口 |
| `PROMETHEUS_PORT` | `9090` | Prometheus 面板端口；详细使用说明见 `docs/deploy/prometheus.md` |
| `USER_HTTP_PORT` | `18001` | User HTTP 端口 |
| `USER_GRPC_PORT` | `19001` | User gRPC 对宿主机暴露端口 |
| `ADMIN_HTTP_PORT` | `18005` | Admin HTTP 端口 |
| `ADMIN_GRPC_PORT` | `19005` | Admin gRPC 端口 |
| `PRODUCT_HTTP_PORT` | `18002` | Product HTTP 端口 |
| `PRODUCT_GRPC_PORT` | `19002` | Product gRPC 对宿主机暴露端口 |
| `ORDER_HTTP_PORT` | `18003` | Order HTTP 端口 |
| `PAYMENT_HTTP_PORT` | `18004` | Payment HTTP 端口 |
| `GATEWAY_HTTP_PORT` | `18000` | Gateway HTTP 端口 |
| `WEB_PORT` | `5173` | 用户端前端容器宿主机端口；开发模式也建议使用该端口 |
| `ADMIN_WEB_PORT` | `5174` | 后台前端容器宿主机端口；开发模式也建议使用该端口 |

## 服务内部关键配置

这些值目前主要写在 Compose 中，单独拆仓部署时需要按服务自行配置：

| 配置项 | 示例值 | 作用 |
| --- | --- | --- |
| `USER_MYSQL_DSN` | `root:root@tcp(mysql-user:3306)/user?charset=utf8mb4&parseTime=True&loc=Local` | User 服务数据库连接串 |
| `ADMIN_MYSQL_DSN` | `root:root@tcp(mysql-admin:3306)/admin?charset=utf8mb4&parseTime=True&loc=Local` | Admin 服务数据库连接串 |
| `PRODUCT_MYSQL_DSN` | `root:root@tcp(mysql-product:3306)/product?charset=utf8mb4&parseTime=True&loc=Local` | Product 服务数据库连接串 |
| `ORDER_MYSQL_DSN` | `root:root@tcp(mysql-order:3306)/order?charset=utf8mb4&parseTime=True&loc=Local` | Order 服务数据库连接串 |
| `PAYMENT_MYSQL_DSN` | `root:root@tcp(mysql-payment:3306)/payment?charset=utf8mb4&parseTime=True&loc=Local` | Payment 服务数据库连接串 |
| `GATEWAY_MYSQL_DSN` | `root:root@tcp(mysql-gateway:3306)/gateway?charset=utf8mb4&parseTime=True&loc=Local` | Gateway 购物车数据库连接串 |
| `*_REDIS_ADDR` | `redis:6379` | 服务访问 Redis 地址 |
| `*_NATS_URL` | `nats://nats:4222` | 服务访问 NATS 地址 |
| `GATEWAY_USER_GRPC_ADDR` | `user:9090` | Gateway 访问 User gRPC 地址 |
| `GATEWAY_ADMIN_GRPC_ADDR` | `admin:9090` | Gateway 访问 Admin gRPC 地址 |
| `GATEWAY_PRODUCT_GRPC_ADDR` | `product:9090` | Gateway 访问 Product gRPC 地址 |
| `GATEWAY_ORDER_GRPC_ADDR` | `order:9090` | Gateway 访问 Order gRPC 地址 |
| `GATEWAY_PAYMENT_GRPC_ADDR` | `payment:9090` | Gateway 访问 Payment gRPC 地址 |
| `USER_AVATAR_ROOT` | `/data/gobao/user-avatars` | User 服务头像文件本地根目录（需挂卷持久化） |
| `USER_AVATAR_BASE_URL` | `/avatars` | 头像对外访问前缀，与落库的 `avatar_url` 一致 |
| `PRODUCT_MEDIA_ROOT` | `/data/gobao/product-media` | Product 服务商品媒体文件本地根目录（需挂卷持久化） |
| `PRODUCT_MEDIA_BASE_URL` | `/media` | 商品媒体对外访问前缀，与落库的媒体 URL 一致 |
| `GATEWAY_EXPOSE_DEV_ENDPOINTS` | `false` | 是否注册开发/演示便利接口（如读回改密验证码），生产须保持 `false` |

## 数据持久化

当前 Compose 已将以下状态数据挂到持久化卷或宿主机目录：

- `mysql-user-data` / `mysql-product-data` / `mysql-order-data` / `mysql-payment-data` / `mysql-gateway-data` / `mysql-admin-data`
  - 分别持久化六个 MySQL 服务的 `/var/lib/mysql`
- `redis-data`
  - 持久化 Redis `/data`，并启用 AOF（`appendonly yes`）
- `nats-data`
  - 持久化 NATS JetStream 数据
- `./runtime/user-avatars`
  - 持久化用户头像文件
- `./runtime/product-media`
  - 持久化商品媒体文件

安全重启建议：

- 日常重启使用 `docker compose restart`
- 需要重建服务镜像时使用 `docker compose down && docker compose up -d --build`
- **不要**使用 `docker compose down -v`，否则会删除命名卷，导致 MySQL / Redis / NATS 持久化数据被清空

## 前端相关变量

开发模式前端默认读取：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_GATEWAY_BASE_URL` | 空（回退同源） | 前端请求 Gateway 的基础地址；未设置时按当前站点同源请求 |
| `VITE_EXPOSE_DEV_PASSWORD_CODE` | `true`（仅本地联调建议） | 是否显示个人页“获取验证码（开发）”按钮；生产展示时应设为 `false` |

如需切换后端地址：

```bash
cd gobao-web
VITE_GATEWAY_BASE_URL=http://localhost:18000 npm run dev
```

容器化前端不需要设置 `VITE_GATEWAY_BASE_URL`。前端构建产物默认使用同源请求，Nginx 会把 `/api/` 反代到 `gateway:8080`，把 `/media/` 反代到 `product:8080`，把 `/avatars/` 反代到 `user:8080`。

如需一键切换开发/生产展示态，可执行：

```bash
bash scripts/switch-env-mode.sh dev --restart-gateway
bash scripts/switch-env-mode.sh prod --restart-gateway
```
