# GoBao Prometheus 说明

## 作用

Prometheus 用于本地联调与压测环境的指标采集。Compose 会随 MySQL、Redis、NATS 和后端服务一起启动 Prometheus，统一采集网关与各微服务的 RED 指标（请求量 / 错误 / 耗时），用于观察服务健康度、定位瓶颈，以及后续接入 Grafana 或告警规则。

当前 Prometheus 只作为开发、演示与压测环境的监控入口，不承担生产级告警、长期存储或权限隔离能力。

## 启动方式

在仓库根目录执行：

```bash
bash scripts/deploy.sh
```

或直接使用 Compose：

```bash
docker compose -f gobao-deploy/docker-compose.yml up -d prometheus
```

Prometheus 默认访问地址：

```text
http://localhost:9090
```

如果需要修改端口，在根目录 `.env` 中调整 `PROMETHEUS_PORT=9090` 后重启 Prometheus。

> 注意：仅修改 `prometheus.yml`（容器以 volume 挂载该文件）时，`up -d prometheus` 不会重新加载配置，需显式重启：
>
> ```bash
> docker compose -f gobao-deploy/docker-compose.yml restart prometheus
> ```

## 配置文件

配置文件位于 `gobao-deploy/prometheus.yml`，每 5 秒抓取一次，覆盖网关与全部后端服务：

```yaml
global: { scrape_interval: 5s }
scrape_configs:
  - job_name: gateway
    static_configs: [{ targets: ["gateway:8080"] }]
  - job_name: user
    static_configs: [{ targets: ["user:8080"] }]
  - job_name: admin
    static_configs: [{ targets: ["admin:8080"] }]
  - job_name: product
    static_configs: [{ targets: ["product:8080"] }]
  - job_name: order
    static_configs: [{ targets: ["order:8080"] }]
  - job_name: payment
    static_configs: [{ targets: ["payment:8080"] }]
```

- `gateway:8080` 等是 Compose 内部服务名，不是宿主机端口；宿主机浏览器访问 Prometheus 用 `localhost:${PROMETHEUS_PORT}`。
- 所有服务均在容器内 `:8080` 暴露 `/metrics`，正常情况下 6 个 target 都应为 `UP`。

## 指标暴露状态

所有服务均已统一接入 Prometheus 指标，可在 `http://localhost:9090/targets` 查看，预期 6 个 target 全部 `UP`。

各服务暴露的指标分两类：

### HTTP RED 指标（仅 gateway）

由 `gobao-gateway` 的 Gin 中间件 `middleware.Metrics` 采集：

| 指标 | 类型 | 标签 | 含义 |
|------|------|------|------|
| `http_server_requests_total` | counter | `service,method,route,status` | 按路由模板与状态码累计的请求数 |
| `http_server_request_duration_seconds` | histogram | `service,method,route` | 请求处理耗时分布（秒） |

> `route` 使用 Gin 路由模板（如 `/api/v1/orders`）而非真实路径，避免路径参数造成标签高基数；未匹配任何路由的请求归并为 `route="unmatched"`。

### gRPC RED 指标（user / admin / product / order / payment）

由 `gobao-pkg/grpcx.Metrics` 拦截器采集，已在统一服务模板 `gobao-pkg/server` 中默认注入，所有用该模板启动的 gRPC 服务自动接入：

| 指标 | 类型 | 标签 | 含义 |
|------|------|------|------|
| `grpc_server_handled_total` | counter | `service,method,code` | 按 gRPC 全限定方法与状态码累计的请求数 |
| `grpc_server_handling_seconds` | histogram | `service,method` | 方法处理耗时分布（秒） |

此外所有服务都包含 `prometheus/client_golang` 默认的 Go runtime 与进程指标（`go_*`、`process_*`）。

> 说明：Prometheus 惰性输出，某个 `method/code` 标签组合只有在被实际调用过一次后才会出现在 `/metrics` 中。服务刚启动、相关接口尚未被访问时对应指标为空属正常现象。

## 常用查询

### 基础

```promql
up                       # 各 target 是否可用
up{job="gateway"}        # 仅看网关
```

### HTTP（网关，面向压测）

```promql
# 各路由 QPS
sum(rate(http_server_requests_total{service="gateway"}[1m])) by (route)

# 整体错误率（5xx 占比）
sum(rate(http_server_requests_total{service="gateway",status=~"5.."}[1m]))
  / sum(rate(http_server_requests_total{service="gateway"}[1m]))

# 各路由 P99 延迟
histogram_quantile(0.99,
  sum(rate(http_server_request_duration_seconds_bucket{service="gateway"}[1m])) by (le, route))
```

### gRPC（后端服务，定位瓶颈）

```promql
# 某服务各方法 QPS
sum(rate(grpc_server_handled_total{service="product"}[1m])) by (method)

# 非 OK 调用速率（按服务/方法/状态码）
sum(rate(grpc_server_handled_total{code!="OK"}[1m])) by (service, method, code)

# 某服务各方法 P99 延迟
histogram_quantile(0.99,
  sum(rate(grpc_server_handling_seconds_bucket{service="product"}[1m])) by (le, method))
```

### 下单链路压测专用

```promql
# 库存扣减的乐观锁并发冲突速率（DeductStock 返回 Aborted）
sum(rate(grpc_server_handled_total{service="product",method=~".*DeductStock",code="Aborted"}[1m]))

# 下单接口 QPS 与成功（201）/冲突（409）分布
sum(rate(http_server_requests_total{service="gateway",route="/api/v1/orders"}[1m])) by (status)
```

## 排查步骤

1. 确认 Prometheus 容器运行：`docker compose -f gobao-deploy/docker-compose.yml ps prometheus`
2. 确认配置已加载（改过 `prometheus.yml` 后需 `restart prometheus`）：
   `docker compose -f gobao-deploy/docker-compose.yml exec prometheus cat /etc/prometheus/prometheus.yml`
3. 查看 Targets 页面：`http://localhost:9090/targets`
4. 若某服务为 `DOWN`，确认对应容器是否运行：`docker compose ... ps <service>`
5. 若指标为空，先用对应接口打一次流量再观察（惰性输出，见上文说明）。

## 后续扩展建议

1. 补充关键业务指标：下单成功数、支付成功数、库存扣减失败数、购物车写入数等（在各服务用 `promauto` 自定义 collector）。
2. 增加 Grafana Dashboard，展示服务状态、QPS、延迟分位与错误率。
3. 为生产环境增加认证、网络隔离、长期存储与告警规则。

## 注意事项

- Prometheus 当前未配置持久化数据卷，重建容器后历史指标会丢失。
- 当前未配置认证，不能直接暴露到公网。
- 本文档只描述本地 Compose 联调 / 压测模式；生产部署需单独设计监控网络、权限与数据保留策略。
