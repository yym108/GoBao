# 下单链路并发压测（k6）

对**普通下单链路**做并发压测，验证一致性（不超卖、账平）、吞吐/延迟与容量拐点。
秒杀链路当前 Order 侧仅为 mock，未纳入本压测。

## 链路与一致性机制

`POST /api/v1/orders`（JWT）→ 幂等(`userID:requestID`) → 读商品快照前置检查
→ **Redis 权威库存 + Lua 原子扣减**（键 `product:stock:{id}`，库存不足判 `Aborted`）→ 落订单。

- HTTP `201` 成功 / `409` 库存不足·重复 / `412` 不可售 / `400` 参数错。
- 不超卖由 Lua 脚本「`cur<q` 即拒绝、否则 `DECRBY`」的原子性保证，绝不写负库存。
- 扣减热路径只走 Redis，不碰 MySQL 库存行，因此**没有单热点商品的行锁吞吐天花板**；
  Redis 库存由 product 服务每分钟回写 MySQL 备份（详见 `gobao-product` README「库存架构」）。
- 历史方案曾用 MySQL `version` 乐观锁，单热点商品吞吐被压在 ~485 单/秒；
  改 Redis 后同热点压测约 ~1862 单/秒（约 3.8×），p95 由数百 ms 降到约 69ms。

## 前置条件

- 服务已启动：`bash scripts/deploy.sh`（仓库根目录），网关默认 `http://localhost:18000`。
- 安装 k6：`brew install k6`。
- 监控：Prometheus `http://localhost:9090`，指标说明见 `docs/deploy/prometheus.md`。

## 文件

| 文件 | 作用 |
|------|------|
| `order_load.js` | k6 主脚本，支持 `consistency` 与 `capacity` 两场景 |
| `reset_stock.sh` | 压测前重置目标商品库存并清理其历史订单 |
| `reconcile.sh` | 压测后对账：库存扣减量 vs 订单数，判定超卖/账平 |

## 运行步骤

### 场景一：一致性（小库存，验证不超卖）

```bash
cd gobao-deploy/loadtest

# 1. 重置库存为 50（同时清理该商品历史订单）
./reset_stock.sh 1004001 50

# 2. 发起 2000 个请求、100 并发抢 50 库存
SCENARIO=consistency PRODUCT_ID=1004001 USERS=50 VUS=100 ITERATIONS=2000 \
  k6 run order_load.js

# 3. 对账（第一个参数填步骤 1 的初始库存）
./reconcile.sh 50 1004001
```

预期：`orders_success ≈ 50`，`orders_conflict ≈ 1950`，`orders_failed = 0`；
对账 `未超卖` 且 `账平`（扣减 50 == 订单数 50）。

### 场景二：容量（大库存，压吞吐找拐点）

```bash
# 1. 重置库存为 5000
./reset_stock.sh 1004001 5000

# 2. 到达率阶梯加压（50→600 req/s）
SCENARIO=capacity PRODUCT_ID=1004001 USERS=100 \
  k6 run order_load.js

# 3. 对账
./reconcile.sh 5000 1004001
```

关注 k6 的 `http_req_duration` P95/P99、`orders_success` 速率，以及 Prometheus 中各服务延迟拐点。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `SCENARIO` | `consistency` | `consistency` 固定迭代 / `capacity` 到达率阶梯 |
| `BASE_URL` | `http://localhost:18000` | 网关地址 |
| `PRODUCT_ID` | `1004001` | 目标商品 |
| `USERS` | `50` | 预注册用户池规模 |
| `VUS` | `100` | 并发虚拟用户（capacity 下为 preAllocatedVUs） |
| `ITERATIONS` | `2000` | consistency 场景总请求数 |
| `START_RATE` / `MAX_VUS` | `20` / `800` | capacity 场景起始到达率与 VU 上限 |

## 压测期间观测（Prometheus PromQL）

```promql
# 下单接口 QPS 与 201/409 分布
sum(rate(http_server_requests_total{service="gateway",route="/api/v1/orders"}[30s])) by (status)

# 下单 P99 延迟
histogram_quantile(0.99,
  sum(rate(http_server_request_duration_seconds_bucket{service="gateway",route="/api/v1/orders"}[30s])) by (le))

# 库存扣减被拒速率（Redis Lua 判扣失败：库存不足/商品未预热）
sum(rate(grpc_server_handled_total{service="product",method=~".*DeductStock",code="Aborted"}[30s]))
```

同时用 `docker stats` 观察哪个容器（product / mysql-product / order）最先打满 CPU。

## 注意

- 本地单机 Docker Compose，所有服务 + 6 个 MySQL + Redis + NATS 共享一台机器，
  瓶颈很可能先出现在宿主机资源而非业务代码，结论需结合此背景看。
- 每轮压测前务必先 `reset_stock.sh`，保证初始状态干净、对账准确。
