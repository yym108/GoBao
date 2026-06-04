# GoBao

GoBao 是一个面向 PC 端的精品电子商品演示商城，采用 Go 微服务 + React 双前端的组合架构。

当前已包含两套前端：

- `gobao-web`：用户端精品电子商城
- `gobao-admin-web`：后台管理控制台

当前服务链路为：

`gobao-web / gobao-admin-web -> gobao-gateway -> gobao-user / gobao-admin / gobao-product / gobao-order / gobao-payment -> MySQL / Redis / NATS`

当前项目已落地的核心能力：

- 用户注册、登录、资料维护、头像上传、邮箱验证码改密
- 后台管理员登录、超级管理员账号体系
- 商品组 / 商品版本 / 类目 / 库存 / 媒体管理
- 购物车、下单、支付 mock、订单流转
- 收藏、地址簿、个人中心
- Docker Compose 一键部署
- MySQL / Redis / NATS 持久化
- 开发联调态 / 生产展示态一键切换

## 仓库体系

当前 GitHub 仓库已经拆分为以下结构：

- `GoBao`：综合部署主仓，保存稳定源码副本、部署脚本与集成文档
- `GoBao-legacy`：旧单仓历史版本，只保留历史，不再作为主开发入口
- `gobao-web`：前端精品电子商城
- `gobao-admin-web`：后台管理前端
- `gobao-gateway`：统一 HTTP 入口与购物车聚合层
- `gobao-user`：用户、认证、资料能力
- `gobao-admin`：后台账号、后台认证与超级管理员能力
- `gobao-product`：商品组、商品版本、类目、库存、媒体
- `gobao-order`：订单与结算链路
- `gobao-payment`：支付 mock 与支付状态流转
- `gobao-proto`：gRPC 契约与生成代码
- `gobao-pkg`：公共基础库
- `gobao-deploy`：Docker Compose、SQL 初始化、监控与联调脚本

## 仓库职责

- 日常业务开发：优先进入对应模块仓
- 集成联调与一键部署：进入当前 `GoBao` 主仓
- 历史追溯：查看 `GoBao-legacy`

## 一键部署

首次使用建议按下面顺序执行：

```bash
bash scripts/bootstrap.sh
bash scripts/deploy.sh
```

主仓保留部署所需的全部源码副本与配置文件，clone 后无需再额外拉取子仓库。

`bootstrap.sh` 会检查 Docker / Docker Compose，并生成默认 `.env`。

默认会使用 `gobao-deploy/docker-compose.yml` 拉起依赖与后端服务。
该 Compose 也会构建并启动两个前端容器：

- 用户端前端：`http://localhost:5173`
- 后台前端：`http://localhost:5174`

如需切换环境模式：

```bash
bash scripts/switch-env-mode.sh dev --restart-gateway
bash scripts/switch-env-mode.sh prod --restart-gateway
```

说明：

- `dev`：开启网关开发验证码接口，并显示个人页“获取验证码（开发）”按钮
- `prod`：关闭该接口，并隐藏该按钮
- 该脚本会修改根目录 `.env` 与 `gobao-web/.env.local`

前端开发模式也可以单独启动，适合需要热更新调试页面时使用：

```bash
cd gobao-web
npm install
npm run dev
```

后台前端单独启动：

```bash
cd gobao-admin-web
npm install
npm run dev
```

默认访问地址：

- 用户端前端：`http://localhost:5173`
- 后台前端：`http://localhost:5174`
- Gateway：`http://localhost:18000`
- Prometheus：`http://localhost:9090`

说明：

- 如果本地 `5173` 或 `5174` 已被占用，Vite 会自动顺延到下一个可用端口
- 如果你刚切换了 `dev/prod` 环境模式，需要重启对应前端进程，新的前端变量才会生效
- 容器化前端使用 Nginx 提供静态文件，并把 `/api/`、`/media/`、`/avatars/` 反代到 Compose 内部服务

## 数据持久化

当前部署默认已持久化以下状态数据：

- 六个 MySQL 数据库
- Redis
- NATS JetStream
- 用户头像目录
- 商品媒体目录

日常重启建议：

```bash
docker compose -f gobao-deploy/docker-compose.yml down
docker compose -f gobao-deploy/docker-compose.yml up -d --build
```

不要使用：

```bash
docker compose -f gobao-deploy/docker-compose.yml down -v
```

因为这会删除命名卷，导致持久化数据被清空。

## 文档入口

- 快速启动：`docs/deploy/quick-start.md`
- 环境变量说明：`docs/deploy/env-reference.md`
- 持久化与备份：`docs/deploy/persistence-and-backup.md`
- Prometheus 说明：`docs/deploy/prometheus.md`
- 模块独立部署：`docs/deploy/module-deploy.md`
- 常见问题：`docs/deploy/troubleshooting.md`
- 前端接口文档：`docs/api/frontend-api.md`
- 内部接口文档：`docs/api/internal-api.md`

## 常用命令

```bash
make build
make test
bash scripts/switch-env-mode.sh dev --restart-gateway
bash scripts/switch-env-mode.sh prod --restart-gateway
bash scripts/stop.sh
bash scripts/reset.sh
```

说明：

- `stop.sh`：停止当前 Compose 栈，但保留数据卷
- `reset.sh`：删除 Compose 栈和卷，回到干净环境

## 端口摘要

- `5173`：用户端前端开发服务器
- `5174`：后台前端开发服务器
- `18000`：Gateway
- `18001`：User
- `18002`：Product
- `18003`：Order
- `18004`：Payment
- `18005`：Admin
- `19001`：User gRPC
- `19002`：Product gRPC
- `19005`：Admin gRPC
- `3307`：User MySQL
- `3312`：Admin MySQL
- `3308`：Product MySQL
- `3309`：Order MySQL
- `3310`：Payment MySQL
- `3311`：Gateway MySQL
- `6379`：Redis
- `4222`：NATS
- `8222`：NATS Monitor
- `9090`：Prometheus
