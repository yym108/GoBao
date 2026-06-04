# gobao-admin

GoBao 的后台管理员服务，负责后台账号认证、超级管理员权限和后台账号管理能力。

## 作用

- 后台管理员登录
- 当前后台账号资料查询
- 后台账号自助修改密码
- 超级管理员查询后台账号列表
- 超级管理员创建后台账号
- 超级管理员重置其他后台账号密码

## 关系

- 被 `gobao-gateway` 通过 gRPC 调用
- 依赖 `gobao-pkg` 提供 JWT、错误语义和基础组件
- 依赖 `gobao-proto` 提供管理员 gRPC 契约
- 使用 `gobao-deploy` 提供的 `mysql-admin`

## 初始账号

通过 `gobao-deploy/sql/init-admin.sql` 初始化管理员库时，会自动创建一个超级管理员：

- 邮箱：`admin@admin`
- 密码：`12345`
- 昵称：`admin`

该账号拥有后台账号管理权限，可创建其他后台账号并重置其密码。

## 独立使用前准备

当前仓库的 `go.mod` 通过本地 `replace` 依赖 `../gobao-pkg` 与 `../gobao-proto`。单独 clone 本仓后，先执行：

```bash
bash scripts/bootstrap-deps.sh
ln -sfn workspace/gobao-pkg ../gobao-pkg
ln -sfn workspace/gobao-proto ../gobao-proto
```

如果你是通过综合部署仓使用，则不需要这一步。

## 关键环境变量

- `ADMIN_HTTP_ADDR`
- `ADMIN_GRPC_ADDR`
- `ADMIN_LOG_LEVEL`
- `ADMIN_MYSQL_DSN`
- `ADMIN_JWT_SECRET`
- `ADMIN_JWT_EXPIRY`

默认 Docker Compose 配置示例：

```text
root:root@tcp(mysql-admin:3306)/admin?charset=utf8mb4&parseTime=True&loc=Local
```

## 启动与验证

```bash
golangci-lint run ./...
go test ./...
go run ./cmd/server
```

如需容器化启动，可直接使用仓库内 `Dockerfile`，或由 `gobao-deploy` / `GoBao` 主仓统一编排。
