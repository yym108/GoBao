# GoBao 数据持久化与备份

## 当前持久化范围

当前 `gobao-deploy/docker-compose.yml` 已将以下状态数据持久化：

- `mysql-user-data`
- `mysql-product-data`
- `mysql-order-data`
- `mysql-payment-data`
- `mysql-gateway-data`
- `mysql-admin-data`
- `redis-data`
- `nats-data`
- `./runtime/user-avatars`
- `./runtime/product-media`

说明：

- 六个 MySQL 数据库均持久化到各自的 Docker 命名卷
- Redis 持久化到 `redis-data`，并启用 AOF
- NATS JetStream 数据持久化到 `nats-data`
- 用户头像与商品媒体文件持久化到仓库内 `runtime/` 目录

---

## 安全重启

推荐命令：

```bash
docker compose -f gobao-deploy/docker-compose.yml restart
```

需要重建镜像但保留数据时：

```bash
docker compose -f gobao-deploy/docker-compose.yml down
docker compose -f gobao-deploy/docker-compose.yml up -d --build
```

不要使用：

```bash
docker compose -f gobao-deploy/docker-compose.yml down -v
```

原因：

- `down -v` 会删除命名卷
- 删除后 MySQL / Redis / NATS 持久化数据会被清空

---

## 备份目录

本地备份建议统一放在：

```text
gobao-deploy/runtime/backups/
```

当前项目已验证可用的备份类型：

- MySQL `.sql`
- Redis `dump.rdb`

---

## 手动备份

### MySQL

示例：备份 user 库

```bash
docker exec gobao-mysql-user-1 \
  mysqldump -uroot -proot --databases user \
  > gobao-deploy/runtime/backups/user.sql
```

其余库同理：

- `gobao-mysql-product-1`
- `gobao-mysql-order-1`
- `gobao-mysql-payment-1`
- `gobao-mysql-gateway-1`
- `gobao-mysql-admin-1`

### Redis

生成快照：

```bash
docker exec gobao-redis-1 redis-cli --rdb /data/dump.rdb
```

拷到本地：

```bash
docker cp gobao-redis-1:/data/dump.rdb gobao-deploy/runtime/backups/redis-dump.rdb
```

---

## 手动恢复

### MySQL

示例：恢复 user 库

```bash
docker exec -i gobao-mysql-user-1 \
  mysql -uroot -proot user \
  < gobao-deploy/runtime/backups/user.sql
```

### Redis

Redis 更适合依赖持久卷自动恢复。

如确需人工恢复：

1. 停止 `redis` 容器
2. 将备份的 `dump.rdb` 放回 `gobao_redis-data` 对应卷目录
3. 重新启动 `redis`

一般开发环境下，Redis 中的数据多为可再生缓存或短期状态；真正关键的业务真值仍应以 MySQL 为准。

---

## 已验证结论

本项目已经完成一次真实回归验证：

1. 记录数据库计数
2. 写入临时 Redis 测试键
3. 执行 `docker compose down`
4. 再执行 `docker compose up -d`
5. 重查数据库计数与 Redis

验证结果：

- MySQL 数据在普通 `down && up -d` 后保留
- Redis 持久化键在普通 `down && up -d` 后保留
- 临时测试键验证后已删除，不污染环境

---

## 建议规范

- 日常开发默认使用 `restart`
- 需要验证冷启动时使用 `down && up -d`
- 只有明确要清空测试环境时，才允许使用 `down -v`
- 在执行任何清库操作前，先导出 MySQL 备份
- 关键演示数据应同时保留一份本地 SQL 备份
