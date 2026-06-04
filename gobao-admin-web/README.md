# GoBao Admin Web

GoBao 的独立后台前端应用，专门承载管理员登录和后台控制台页面。

## 设计目标

- 与用户端前端 `gobao-web` 彻底分离
- 用户端前端崩溃时，后台仍可单独启动和访问
- 后台使用独立构建产物、独立开发端口和独立本地登录态存储

## 技术栈

- React 18
- Vite
- TypeScript
- React Router
- 原生 `fetch`

## 当前页面

- 后台登录
- 后台首页
- 商品管理页
- 图片媒体页
- 后台账号页
- 订单中心占位页

## 当前限制

- 后台订单中心尚未接入管理员专用订单聚合接口，因此当前保留为占位页
- 后台前端当前主要接入管理员认证、商品浏览与媒体浏览的最小能力

## 启动方式

```bash
cd gobao-admin-web
npm install
npm run dev
```

默认访问地址：`http://localhost:5174`

## Gateway 地址配置

默认后端地址：

```bash
http://localhost:18000
```

如需覆盖，可在启动前设置环境变量：

```bash
VITE_GATEWAY_BASE_URL=http://localhost:18000 npm run dev
```

## 构建验证

```bash
cd gobao-admin-web
npm run build
```

## 容器化部署

后台前端支持直接构建为 Nginx 静态站点镜像：

```bash
docker build -t gobao-admin-web .
```

容器内 Nginx 会把同源请求反代到后端服务：

- `/api/` -> `gateway:8080`
- `/media/` -> `product:8080`
- `/avatars/` -> `user:8080`

在主仓统一部署时不需要单独配置 `VITE_GATEWAY_BASE_URL`，浏览器访问 `http://localhost:5174` 即可。

## 与系统的关系

- `gobao-gateway`：唯一 HTTP 依赖
- `gobao-admin`：提供后台登录态与后台账号管理
- `gobao-product`：提供商品与媒体浏览所需数据
- `gobao-deploy`：提供后端联调环境
