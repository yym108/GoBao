# GoBao 常见问题排查

## Docker 无法启动

现象：

- `docker info` 失败
- `docker compose up` 直接报 daemon 不可用

处理方式：

1. 确认 Docker Desktop 已启动
2. 执行 `docker info`
3. 重新运行 `bash scripts/bootstrap.sh`

## 端口冲突

现象：

- Compose 提示 `port is already allocated`

处理方式：

1. 检查本机是否已有 MySQL、Redis、NATS、前端开发服务器占用默认端口
2. 修改根目录 `.env`
3. 重新执行 `bash scripts/deploy.sh`

## 数据库未就绪

现象：

- Gateway 或 Order 启动后马上退出
- 日志中出现 MySQL 连接失败

处理方式：

1. 执行 `docker compose -f gobao-deploy/docker-compose.yml ps`
2. 确认 `mysql-order`、`mysql-gateway` 已健康
3. 查看日志：

```bash
docker compose -f gobao-deploy/docker-compose.yml logs --tail=80 order gateway
```

## MySQL 中文显示为乱码或 `????`

现象：

- 在 `mysql` 命令行里查询中文昵称、标题、地址时显示为 `????`
- 但前端页面或接口返回的中文仍然正常

处理方式：

1. 先确认这是否只是控制台连接字符集问题，而不是数据库真实损坏
2. 执行 `SHOW VARIABLES LIKE 'character_set_%';`，重点检查 `character_set_client`、`character_set_connection`、`character_set_results`
3. 如果客户端默认是 `latin1`，请改用 `utf8mb4` 重新连接：

```bash
docker compose -f gobao-deploy/docker-compose.yml exec -T mysql-admin \
  mysql --default-character-set=utf8mb4 -uroot -proot -D admin
```

4. 如果已经进入控制台，可先执行：

```sql
SET NAMES utf8mb4;
```

5. 如仍怀疑数据损坏，再结合接口返回值、表默认字符集和 `HEX(column)` 结果继续排查

## Redis 或 NATS 不可达

现象：

- 服务日志中出现 Redis 拒绝连接
- 秒杀预热或订单事件链路异常

处理方式：

1. 确认 `redis`、`nats` 容器已运行
2. 检查 `.env` 中端口是否被修改
3. 确认服务内部地址仍使用 Compose 网络地址，如 `redis:6379`、`nats://nats:4222`

## 前端请求失败

现象：

- 页面加载商品失败
- 登录、购物车、订单接口报网络错误

处理方式：

1. 确认 Gateway 已启动并监听 `18000`
2. 检查 `gobao-web` 的 `VITE_GATEWAY_BASE_URL`
3. 打开浏览器开发者工具查看请求地址是否正确

## 测试数据污染

现象：

- 上一次联调的订单、购物车或收藏数据仍然存在

处理方式：

```bash
bash scripts/reset.sh
bash scripts/deploy.sh
```

这会删除当前 Compose 卷并重新初始化数据库，适合做独立测试前的环境重置。

补充说明：

- 如果你只是想“重启服务但保留数据”，不要执行 `reset.sh`
- 请改用：

```bash
docker compose -f gobao-deploy/docker-compose.yml down
docker compose -f gobao-deploy/docker-compose.yml up -d --build
```
