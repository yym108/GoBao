# GoBao Web

一个独立的前端 SPA 演示站，定位为**精品电子商店前端 demo**。它只通过 `gobao-gateway` 的 HTTP API 联调，不直接访问后端数据库。

当前前端方向已经从“大规模多商品平台”调整为：

- 以电子产品为主
- 商品数量克制
- 强调简约与高级感
- 更接近品牌商店而不是平台型电商首页

## 技术栈

- React 18
- Vite
- TypeScript
- React Router
- 原生 `fetch`

## 已实现页面

- 首页与商店主页
- 登录 / 注册
- 商品列表
- 商品详情与商品版本选配
- 购物车
- 订单中心
- 收藏页
- 个人主页与账户详情
- 地址页骨架

## 当前产品语义

前端默认按以下语义解释当前接口与页面：

- 类目：产品线 / 系列导航
- 商品列表：精选商品展示
- 商品详情：精品电子单品详情

## 当前联调范围

当前前端已经接入以下后端能力：

- 用户注册、登录、当前用户态
- 商品列表、商品详情、商品版本选配
- 购物车查询、加入、数量调整、删除
- 订单创建、订单列表、订单详情
- 支付 mock 状态流转
- 收藏查询、添加、取消
- 个人资料查询与基础修改

当前仍以最小可用实现为主，以下部分仍属于后续增强范围：

- 完整地址簿
- 真实支付渠道
- 售后流程
- 复杂运营后台能力

说明：

- 后台管理前端已独立拆分到 `gobao-admin-web`
- 用户端前端 `gobao-web` 不再承载后台登录和后台控制台页面

## 启动方式

```bash
cd gobao-web
npm install
npm run dev
```

默认访问地址：`http://localhost:5173`

## Gateway 地址配置

默认后端地址：

```bash
http://localhost:18000
```

如需覆盖，可在启动前设置环境变量：

```bash
VITE_GATEWAY_BASE_URL=http://localhost:18000 npm run dev
```

也可以在仓库根目录创建 `.env.local`：

```bash
VITE_GATEWAY_BASE_URL=http://localhost:18000
```

## 构建验证

```bash
cd gobao-web
npm run build
```

## 容器化部署

用户端前端支持直接构建为 Nginx 静态站点镜像：

```bash
docker build -t gobao-web .
```

容器内 Nginx 会把同源请求反代到后端服务：

- `/api/` -> `gateway:8080`
- `/media/` -> `product:8080`
- `/avatars/` -> `user:8080`

在主仓统一部署时不需要单独配置 `VITE_GATEWAY_BASE_URL`，浏览器访问 `http://localhost:5173` 即可。

## 与后端的关系

- `gobao-gateway`：唯一 HTTP 依赖
- `gobao-product`：提供商品、商品版本与库存真值
- `gobao-user`：提供登录态与用户信息
- `gobao-order`：提供订单创建、订单查询
- `gobao-payment`：提供支付状态 mock 链路
- `gobao-deploy`：提供后端联调环境
