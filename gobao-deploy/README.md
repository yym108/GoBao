# gobao-deploy

GoBao 的统一部署与联调仓库，负责本地 Docker Compose 编排、SQL 初始化和监控配置。

## 作用

- 启动 MySQL / Redis / NATS
- 启动 User / Admin / Product / Order / Payment / Gateway
- 启动用户端前端 / 后台前端容器
- 提供本地联调环境

## 关系

- 为所有后端服务提供依赖
- 为两个前端提供可访问的 Gateway、Product 媒体和 User 头像反代入口

## 部署

### 方案 1：作为主部署仓子目录使用

如果 `gobao-deploy` 位于综合部署仓内，直接在仓库根目录执行：

```bash
bash scripts/deploy.sh
```

### 方案 2：作为独立部署仓单独使用

先准备源码工作区：

```bash
bash scripts/bootstrap-repos.sh
```

该脚本会把 `gobao-pkg`、`gobao-proto`、`gobao-user`、`gobao-product`、`gobao-order`、`gobao-payment`、`gobao-gateway`、`gobao-web`、`gobao-admin-web` 以浅克隆方式拉到 `workspace/`。

然后启动：

```bash
docker compose --env-file .env.example -f docker-compose.yml up -d --build
```

独立部署仓默认通过 `GOBAO_BUILD_CONTEXT=./workspace` 从 `workspace/` 内构建服务镜像。

默认访问地址：

- 用户端前端：`http://localhost:5173`
- 后台前端：`http://localhost:5174`
- Gateway：`http://localhost:18000`
- Prometheus：`http://localhost:9090`

前端容器由 Nginx 提供静态文件，并把同源路径转发给 Compose 内部服务：

- `/api/` -> `gateway:8080`
- `/media/` -> `product:8080`
- `/avatars/` -> `user:8080`

## 回收

```bash
docker compose --env-file .env.example -f docker-compose.yml down
```

如需清理卷与测试数据：

```bash
docker compose --env-file .env.example -f docker-compose.yml down -v
```

## 内容结构

- `docker-compose.yml`：整套本地依赖与后端编排
- `sql/`：各服务数据库初始化脚本
- `scripts/`：分阶段 smoke 脚本
- `scripts/bootstrap-repos.sh`：独立部署仓模式下的源码工作区初始化脚本
- `prometheus.yml`：Prometheus 采集配置
