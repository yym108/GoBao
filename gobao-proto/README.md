# gobao-proto

GoBao 的接口契约仓库，负责定义所有服务共享的 proto 和生成代码。

## 作用

- 统一 User / Product / Order / Payment / Gateway 的 RPC 契约
- 统一前后端联调时的数据结构
- 为各服务生成 Go 代码

## 关系

- 上游：`gobao-user`、`gobao-product`、`gobao-order`、`gobao-payment`
- 下游：所有使用生成代码的服务仓库

## 目录重点

- `proto/`：原始 protobuf 契约
- `gen/go/`：生成后的 Go 代码
- `buf.yaml`：Buf 模块配置
- `buf.gen.yaml`：Buf 代码生成配置

## 常用命令说明

- `make generate`：根据 `proto/` 重新生成 Go 代码
- `make lint`：执行 Buf 契约检查
- `make breaking`：对比主分支进行 breaking change 检查

若本地要单独维护契约，可先参考仓库根目录 `.env.example` 准备 Buf 缓存目录。 

## 常用命令

```bash
make generate
go test ./...
```
