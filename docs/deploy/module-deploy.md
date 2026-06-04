# GoBao 模块独立部署说明

## 总体原则

每个模块仓都应支持单独 clone、单独安装依赖、单独运行。主部署仓负责整套联调，不替代模块仓自己的最小运行说明。

## `gobao-web`

职责：

- 展示精品电子商店前端页面
- 仅通过 Gateway HTTP API 联调

最小依赖：

- Node.js 20+
- 可访问的 `gobao-gateway`

启动方式：

```bash
npm install
npm run dev
```

关键环境变量：

- `VITE_GATEWAY_BASE_URL`

## `gobao-admin-web`

职责：

- 提供管理员登录与后台控制台页面
- 与 `gobao-web` 独立构建、独立运行、独立保存本地登录态
- 仅通过 Gateway HTTP API 联调，不直接连接后端数据库

最小依赖：

- Node.js 20+
- 可访问的 `gobao-gateway`

启动方式：

```bash
npm install
npm run dev
```

默认端口：

- `5174`

关键环境变量：

- `VITE_GATEWAY_BASE_URL`

## `gobao-deploy`

职责：

- 提供 Docker Compose 编排
- 提供 SQL 初始化与 smoke 脚本

最小依赖：

- Docker
- Docker Compose
- 若作为独立仓使用，先执行 `bash scripts/bootstrap-repos.sh`

启动方式：

```bash
docker compose up -d --build
```

## 后端服务模块

适用模块：

- `gobao-admin`
- `gobao-user`
- `gobao-product`
- `gobao-order`
- `gobao-payment`
- `gobao-gateway`

共同要求：

- Go 1.26.x
- 可访问的 MySQL
- 视模块情况接入 Redis、NATS、上游 gRPC 服务

独立运行前至少要确认：

1. 已执行 `bash scripts/bootstrap-deps.sh`
2. 已按 README 建立 `../gobao-pkg` 与 `../gobao-proto` 的本地链接，或自行调整 `replace`
3. 所需 DSN、Redis、NATS 地址是否可达
4. 若依赖其他服务的 gRPC 地址，是否有本地联调目标

## `gobao-proto`

职责：

- 保存 protobuf 契约
- 生成 Go 代码

最小依赖：

- Go 工具链
- protobuf 相关生成工具

## `gobao-pkg`

职责：

- 公共基础设施代码

最小依赖：

- Go 1.26.x

通常作为其他服务依赖，不单独提供 HTTP 能力。

## 前端容器独立部署

用户端前端和后台前端都可以单独构建为 Nginx 静态站点镜像：

```bash
cd gobao-web
docker build -t gobao-web .

cd ../gobao-admin-web
docker build -t gobao-admin-web .
```

独立运行时需要保证容器能访问 Gateway、Product 和 User 服务。当前默认 Nginx 配置使用 Compose 服务名：

- `/api/` -> `gateway:8080`
- `/media/` -> `product:8080`
- `/avatars/` -> `user:8080`

因此单独部署到其它机器或网络时，需要同步调整对应前端目录下的 `nginx.conf`，或在部署环境中提供同名上游服务。
