# GoBao 快速启动

## 环境要求

- macOS 或 Linux
- Docker Desktop 4.x 或兼容的 Docker Engine
- Docker Compose V2
- Go 1.26.x
- Node.js 20.x 或更高版本

## 首次启动

在仓库根目录执行：

```bash
bash scripts/bootstrap.sh
bash scripts/deploy.sh
```

这两步会完成以下动作：

1. 检查 `docker` 与 `docker compose`
2. 生成根目录 `.env`
3. 启动 MySQL、Redis、NATS、Prometheus
4. 构建并启动 User、Admin、Product、Order、Payment、Gateway
5. 构建并启动用户端前端与后台前端容器

如需快速切换“开发联调态 / 生产展示态”：

```bash
bash scripts/switch-env-mode.sh dev --restart-gateway
bash scripts/switch-env-mode.sh prod --restart-gateway
```

说明：

- `dev` 会开启网关开发验证码接口，并显示个人页“获取验证码（开发）”按钮
- `prod` 会关闭该接口，并隐藏该按钮

## 容器化前端访问

`scripts/deploy.sh` 会直接启动两个前端容器：

- 商店首页：`http://localhost:5173`
- 后台首页：`http://localhost:5174`

两个前端容器都使用 Nginx 提供静态文件，并通过同源路径反代后端：

- `/api/` -> `gateway:8080`
- `/media/` -> `product:8080`
- `/avatars/` -> `user:8080`

因此容器化部署时不需要在浏览器侧配置 `VITE_GATEWAY_BASE_URL`。

## 启动用户端前端开发模式

如需热更新调试页面，可以不使用前端容器，单独打开一个终端执行：

```bash
cd gobao-web
npm install
npm run dev
```

## 启动后台前端开发模式

如需热更新调试后台页面，再打开一个终端执行：

```bash
cd gobao-admin-web
npm install
npm run dev
```

默认访问：

- 商店首页：`http://localhost:5173`
- 后台首页：`http://localhost:5174`
- Gateway API：`http://localhost:18000`
- Prometheus：`http://localhost:9090`

补充说明：

- 如果本地默认端口已被占用，Vite 会自动切到下一个可用端口
- 可根据终端输出确认本次启动实际使用的地址
- Prometheus 用于本地指标采集，详细说明见 `docs/deploy/prometheus.md`
- 容器化前端使用 `.env` 中的 `WEB_PORT` 与 `ADMIN_WEB_PORT` 暴露端口

## 停止与清理

停止服务：

```bash
bash scripts/stop.sh
```

清理容器和测试数据：

```bash
bash scripts/reset.sh
```

注意：

- `reset.sh` 会删除 Compose 卷与容器
- 当前项目已经启用 MySQL / Redis / NATS 持久化卷
- 因此执行 `reset.sh` 等价于清空测试数据

如只想重启且保留数据，请改用：

```bash
docker compose -f gobao-deploy/docker-compose.yml down
docker compose -f gobao-deploy/docker-compose.yml up -d --build
```
