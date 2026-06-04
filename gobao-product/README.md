# gobao-product

GoBao 的商品服务，负责商品、类目、库存与 SKU 详情。

## 作用

- 商品 CRUD
- 类目 CRUD
- 库存扣减与回补（**Redis 权威库存 + Lua 原子扣减**，见下）
- 商品详情、规格组、SKU 列表

## 库存架构（Redis 权威 + Lua 原子扣减 + 定时回写）

库存真值放在 **Redis**，键为 `product:stock:{productID}`，MySQL 仅作种子/备份与后台展示来源。

**为什么这么做**：早期库存扣减走 MySQL 单行条件 UPDATE，同一热点商品高并发下单会在那一行上串行化（行锁），单商品吞吐被压在 ~485 单/秒。改为 Redis 后，同热点商品压测吞吐升至 ~1862 单/秒（约 3.8×），p95 延迟从数百 ms 降到约 69ms。本项目商品数量有限、热点集中，这个改造直接命中瓶颈。

**读写路径**：

| 操作 | 行为 |
|------|------|
| 新建商品 `Create` | 先落 MySQL，再 `SETNX` 把初始库存预热进 Redis（**新增商品即时生效**，无需任何预热脚本） |
| 扣减 `Deduct` | Redis Lua 原子「判库存→`DECRBY`」；键不存在时从 MySQL `SETNX` 回源预热后重试；库存不足/商品不存在 → `ErrStockCASConflict`（上层转 `Aborted`） |
| 回补 `Restore` | Redis Lua `INCRBY`；缺键同样先回源预热 |
| 查询 `FindByProductID` | 数量以 Redis 实时值为准，版本号仍取 MySQL；Redis 缺键时回退 MySQL 数量 |
| 后台改库存 `SetQuantity` | 先按 MySQL `version` 做 CAS 落库，成功后 `SET` 覆盖 Redis |

热路径（Deduct/Restore）**完全不碰 MySQL 库存行**，因此没有行锁瓶颈；MySQL 的 `version` 也不再随每单递增，仍可服务后台 `SetQuantity` 的乐观锁。

**定时回写同步（StockSyncer）**：后台 goroutine 每分钟 `SCAN product:stock:*` 把 Redis 实时库存刷回 MySQL；进程退出前再 flush 一次。

- 动机：库存真值在 Redis，正常运行时 MySQL 的 `quantity` 是陈旧值。若 **Redis 整库丢数据后重启**，会用 MySQL 旧值重新 `SETNX` 预热，已售出的量会被「还原」。周期性回写让 MySQL 备份持续逼近真值，把这种回退误差收敛到一个同步周期（默认 1 分钟）以内。
- 回写是覆盖式写入 `quantity`，**不做 CAS、也不递增 version**，只同步备份/展示值。
- 代码：`internal/adapter/repository/redisrepo/{stock_store.go,stock_syncer.go}`，`mysql.StockRepo.SyncQuantity` 提供底层覆盖写。

> 一致性边界：这是「Redis 权威 + 最终一致的 MySQL 备份」模型，不是强一致双写。同步周期内的极端宕机仍可能丢失最后一段未回写的扣减；对当前商品规模与业务容忍度而言这是可接受的权衡。

## 关系

- 依赖 `gobao-proto`、`gobao-pkg`
- 被 `gobao-gateway` 调用
- 后续也会被 `gobao-order` 继续复用库存能力

## 独立使用前准备

单独 clone 本仓后，先执行：

```bash
bash scripts/bootstrap-deps.sh
ln -sfn workspace/gobao-pkg ../gobao-pkg
ln -sfn workspace/gobao-proto ../gobao-proto
```

## 环境变量

可参考仓库根目录 `.env.example`：

- `PRODUCT_MYSQL_DSN`
- `PRODUCT_REDIS_ADDR`
- `PRODUCT_REDIS_DB`
- `PRODUCT_LOG_LEVEL`

## 启动

```bash
go test ./...
go run ./cmd/server
```

如需容器化启动，可直接使用仓库内 `Dockerfile`，或由 `gobao-deploy` / `GoBao` 主仓统一编排。
