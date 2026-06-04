# GoBao 前端联调接口文档

- **文档定位**：面向前端开发与联调
- **访问入口**：`Gateway HTTP API`
- **当前基础地址**：`http://localhost:18000`
- **更新时间**：2026-06-03

---

## 1. 说明

本文件只覆盖**前端当前可以直接调用的 REST 接口**，包括用户端商店前端与独立后台管理前端。

当前项目的产品定位已经调整为：

**以电子产品为主、强调简约与高级感的精品在线商店。**

因此，前端在使用这些接口时，应默认按以下语义理解：

- 类目：更接近“产品线/系列导航”
- 商品列表：更接近“精选商品展示”
- 商品详情：更接近“精品单品详情”
- 商品组：负责承载同一产品页面与封面卡片的展示信息
- 独立商品版本：负责承载不同规格、价格、库存、状态等实际购买信息
- 秒杀活动：仅后台管理使用，用于后端高并发准备，不对用户前台开放

当前项目采用“Go 微服务 + Gateway + 双前端”的结构：

- 用户端前端：面向消费者，负责商店首页、商品浏览、购物车、下单、支付模拟、个人中心、收藏与地址选择
- 后台管理前端：面向运营 / 管理员，独立部署，负责商品、图片媒体、类目、订单、后台账号等管理能力
- Gateway：前端唯一 HTTP 入口，前端不直接调用各个后端微服务
- 后端微服务：负责用户、商品、订单、支付、后台账号等业务真值

前端实现原则：

- 前端只负责内容展示、用户输入校验、交互编排与接口提交
- 商品价格、库存、购买状态、订单金额、支付状态等业务判断均以后端返回为准
- 涉及规格、价格、订单、支付的逻辑运算不得在前端自行推导
- 后台管理端可以编辑展示信息，但保存后仍需要以后端返回的最新详情作为页面真值

当前已经可用的业务范围：

- 用户注册 / 登录 / 获取当前用户
- 个人资料读写 / 头像上传裁剪 / 改密验证码流程
- 后台管理员登录 / 当前后台身份查询 / 后台账号管理
- 商品列表 / 商品详情
- 类目列表
- 购物车查询 / 加购 / 改数量 / 删除
- 创建订单 / 订单详情 / 订单列表 / 取消订单
- 支付单查询 / 模拟支付确认
- 商品与类目的后台写接口（需 JWT）
- 商品组规格维度定义（`spec_keys`）与子商品填值
- 后台订单管理（全部订单列表 / 按状态与买家邮箱筛选 / 订单详情 / 关闭订单）
- 后端驱动的商品版本选配联调

补充说明：

- Gateway 已开放创建订单、订单详情、订单列表、取消订单接口，当前按单个独立商品 `product_id` 下单。
- 购物车页当前已接入“一次提交整车，逐条生成独立订单”的前端结算编排。
- Gateway 已开放支付单查询与模拟支付确认接口，当前主要用于后端联调与管理验证，不代表真实收银台能力。
- 当前已经具备最小下单与支付状态回写闭环，但仍未提供真实支付页与真实收银台能力。
- 后台总览页当前复用既有业务接口聚合展示，不单独依赖专用 Dashboard 接口。

---

## 2. 鉴权方式

需要登录的接口统一使用：

```http
Authorization: Bearer <access_token>
```

`access_token` 通过登录接口获取。

---

## 3. 通用约定

### 3.1 Content-Type

请求体为 JSON 的接口统一使用：

```http
Content-Type: application/json
```

### 3.2 常见成功状态码

- `200 OK`：查询、更新成功
- `201 Created`：创建成功
- `204 No Content`：删除成功，无响应体

### 3.3 错误响应

当前网关存在两种错误响应风格：

#### 用户认证接口错误

```json
{
  "code": "INVALID_ARGUMENT",
  "message": "invalid request body"
}
```

#### 商品 / 类目接口错误

```json
{
  "error": "商品不存在"
}
```

前端联调阶段请按**接口分组**处理，不要假设当前所有错误体结构完全统一。

前端当前处理策略补充：

- 登录 / 注册页不会直接展示后端原始错误文案
- 认证相关报错会被前端统一映射为中文提示
- 商品、购物车等页面也会优先展示前端自己的用户态错误文案

### 3.4 常见错误码 / 状态

- `400`：参数错误
- `401`：未登录或 token 无效
- `403`：无权限
- `404`：资源不存在
- `409`：冲突（如重复创建、并发冲突）
- `412`：前置条件不满足（如类目仍被引用）
- `500`：服务内部错误

---

## 4. 运维与鉴权辅助接口

### 4.1 健康检查

**GET** `/healthz`

#### 响应

纯文本：

```text
ok
```

---

### 4.2 鉴权测试

**GET** `/api/v1/ping`

需要 JWT。

#### 响应示例

```json
{
  "pong": true,
  "user_id": 1
}
```

---

## 5. 用户接口

### 5.1 注册

**POST** `/api/v1/auth/register`

#### 请求体

```json
{
  "email": "alice@test.com",
  "password": "Test@12345",
  "nickname": "alice"
}
```

#### 成功响应 `201`

```json
{
  "user_id": 1
}
```

说明：

- 当前后端仍返回 `user_id`
- 前端注册成功后不应展示该值，而应直接切回登录态
- 前端当前行为是：注册成功后保留邮箱、清空密码，并提示“注册成功，请继续登录。”

---

### 5.2 登录

**POST** `/api/v1/auth/login`

#### 请求体

```json
{
  "email": "alice@test.com",
  "password": "Test@12345"
}
```

#### 成功响应 `200`

```json
{
  "access_token": "jwt-token",
  "expires_at": 1777700000,
  "user_id": 1
}
```

字段说明：

- `access_token`：JWT
- `expires_at`：Unix 秒时间戳
- `user_id`：用户 ID

前端当前行为补充：

- 登录成功后会优先回跳到登录前要求进入的目标页
- 若没有回跳目标，默认进入 `/profile`

---

### 5.3 发送找回密码验证码

**POST** `/api/v1/auth/password/code`

#### 请求体

```json
{
  "email": "alice@test.com"
}
```

#### 成功响应 `200`

```json
{
  "message": "verification code sent"
}
```

说明：

- 该接口用于登录页“找回密码”流程
- 当前验证码不会真实发送到邮箱，而是写入 Redis，并打印到 `user` 服务日志
- 同一邮箱 60 秒内重复发送会返回冲突错误

### 5.4 使用验证码重置密码

**POST** `/api/v1/auth/password/reset`

#### 请求体

```json
{
  "email": "alice@test.com",
  "code": "123456",
  "new_password": "NewPass@123"
}
```

#### 成功响应 `200`

```json
{
  "message": "password reset"
}
```

说明：

- 该接口服务于未登录状态下的找回密码流程
- 验证码校验成功后立即失效

---

### 5.5 获取当前用户

**GET** `/api/v1/auth/me`

需要 JWT。

#### 成功响应 `200`

```json
{
  "user_id": 1,
  "email": "alice@test.com",
  "nickname": "alice",
  "created_at": "2026-06-02T10:00:00Z"
}
```

---

### 5.6 获取当前个人资料

**GET** `/api/v1/profile`

需要 JWT。

#### 成功响应 `200`

```json
{
  "user_id": 1,
  "email": "alice@test.com",
  "nickname": "alice",
  "avatar_url": ""
}
```

说明：

- 该接口用于 `/profile/account` 二级个人页
- 当前不返回 `created_at`
- `avatar_url` 已支持通过头像上传接口生成并回写

### 5.7 更新个人资料

**PUT** `/api/v1/profile`

需要 JWT。

#### 请求体

```json
{
  "nickname": "alice new",
  "avatar_url": "https://example.com/avatar.png"
}
```

#### 成功响应 `200`

```json
{
  "user_id": 1,
  "email": "alice@test.com",
  "nickname": "alice new",
  "avatar_url": "https://example.com/avatar.png"
}
```

说明：

- `nickname` 与 `avatar_url` 均可编辑并落库
- 头像现支持「上传裁剪」流程（见 5.7B），`avatar_url` 由上传接口回写；本接口仍可直接提交 `avatar_url` 字符串
- 前端已统一使用真实头像并以圆形展示，无头像时回退默认图标

### 5.7B 上传头像

**POST** `/api/v1/profile/avatar`

需要 JWT。

#### 请求体

```json
{
  "file_name": "avatar.png",
  "mime_type": "image/png",
  "content_base64": "<base64>"
}
```

#### 成功响应 `200`

```json
{
  "user_id": 1,
  "email": "alice@test.com",
  "nickname": "alice",
  "avatar_url": "/avatars/avatars/1/1717132800-123456.png"
}
```

说明：

- 头像文件由 **user 服务**自有存储管理（不挂在商品媒体库），落库的 `avatar_url` 指向 user 服务对外的 `/avatars/` 静态前缀
- 仅接受图片类型（`mime_type` 以 `image/` 开头），大小上限 5MB
- 前端当前流程：选择图片 → 弹出裁剪框（1:1、圆形预览）→ 生成裁剪后 PNG 的 base64 → 调用本接口 → 用返回的 `avatar_url` 刷新本地用户态
- dev 下 `/avatars` 由前端 vite 代理到 user 服务（默认 `127.0.0.1:18001`）

### 5.8 发送改密验证码

**POST** `/api/v1/profile/password/code`

需要 JWT。

#### 请求体

无

#### 成功响应 `200`

```json
{
  "message": "verification code sent"
}
```

说明：

- 本期验证码不会真实发送到邮箱
- 后端会把验证码写入 Redis，并打印到 `user` 服务日志
- 同一用户 60 秒内重复发送会返回冲突错误

### 5.8B 获取改密验证码（仅开发/演示）

**GET** `/api/v1/profile/password/code`

需要 JWT。

#### 成功响应 `200`

```json
{
  "code": "432552"
}
```

#### 常见失败状态

- `401`：未登录
- `404`：当前没有待用验证码（未发送或已过期）

说明：

- 这是**开发/演示便利接口**：验证码不真发邮件，本接口直接从 Redis 把**当前登录用户自己的**待用验证码读回，省去翻日志
- 只能取自己的验证码（`user_id` 取自 JWT），无法查询他人
- **受网关开关 `GATEWAY_EXPOSE_DEV_ENDPOINTS` 控制，默认关闭**；关闭时该路由不注册，访问返回 `404`。生产环境必须保持关闭
- 前端账户中心仅在 `VITE_EXPOSE_DEV_PASSWORD_CODE=true` 时显示「获取验证码（开发）」按钮，点击后自动填入验证码输入框；生产展示态应保持关闭

### 5.9 使用验证码修改密码

**POST** `/api/v1/profile/password/change`

需要 JWT。

#### 请求体

```json
{
  "code": "123456",
  "new_password": "NewPass@123"
}
```

#### 成功响应 `200`

```json
{
  "message": "password changed"
}
```

说明：

- 验证码有效期当前为 5 分钟
- 修改成功后验证码立即失效
- 前端当前通过 `/profile/account` 页面承接该流程

---

## 5A. 地址簿接口

### 5A.1 查询地址列表

**GET** `/api/v1/addresses`

需要 JWT。

#### 成功响应 `200`

```json
{
  "addresses": [
    {
      "id": 12,
      "user_id": 1,
      "receiver_name": "张三",
      "receiver_phone": "13800138000",
      "province": "上海市",
      "city": "上海市",
      "district": "浦东新区",
      "address_line": "世纪大道 100 号 18 层",
      "postal_code": "200120",
      "is_default": true,
      "created_at": "2026-06-02T10:00:00Z",
      "updated_at": "2026-06-02T10:00:00Z"
    }
  ]
}
```

### 5A.2 查询单条地址

**GET** `/api/v1/addresses/:id`

需要 JWT。

#### 成功响应 `200`

```json
{
  "address": {
    "id": 12,
    "user_id": 1,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "is_default": true,
    "created_at": "2026-06-02T10:00:00Z",
    "updated_at": "2026-06-02T10:00:00Z"
  }
}
```

### 5A.3 新建地址

**POST** `/api/v1/addresses`

需要 JWT。

#### 请求体

```json
{
  "receiver_name": "张三",
  "receiver_phone": "13800138000",
  "province": "上海市",
  "city": "上海市",
  "district": "浦东新区",
  "address_line": "世纪大道 100 号 18 层",
  "postal_code": "200120",
  "is_default": true
}
```

#### 成功响应 `201`

```json
{
  "address": {
    "id": 12,
    "user_id": 1,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "is_default": true,
    "created_at": "2026-06-02T10:00:00Z",
    "updated_at": "2026-06-02T10:00:00Z"
  }
}
```

### 5A.4 更新地址

**PUT** `/api/v1/addresses/:id`

需要 JWT。

请求体与新建地址一致。

#### 成功响应 `200`

```json
{
  "address": {
    "id": 12,
    "user_id": 1,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "is_default": true,
    "created_at": "2026-06-02T10:00:00Z",
    "updated_at": "2026-06-02T10:10:00Z"
  }
}
```

### 5A.5 删除地址

**DELETE** `/api/v1/addresses/:id`

需要 JWT。

#### 成功响应 `200`

```json
{
  "message": "address deleted"
}
```

### 5A.6 设置默认地址

**POST** `/api/v1/addresses/default`

需要 JWT。

#### 请求体

```json
{
  "address_id": 12
}
```

#### 成功响应 `200`

```json
{
  "address": {
    "id": 12,
    "user_id": 1,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "is_default": true,
    "created_at": "2026-06-02T10:00:00Z",
    "updated_at": "2026-06-02T10:10:00Z"
  }
}
```

---

## 6. 类目接口

### 6.1 查询类目列表

**GET** `/api/v1/categories`

公开接口，无需登录。

在新定位下，前端建议把类目展示为：

- 产品线导航
- 系列分组
- 精选硬件分类

#### 成功响应 `200`

```json
{
  "items": [
    {
      "id": 1,
      "name": "数码",
      "sort_order": 1,
      "created_at": 1777365000,
      "updated_at": 1777365000
    }
  ]
}
```

---

## 6B. 后台管理员接口

说明：

- 后台接口统一走 `/api/v1/admin/*`
- 需要后台 JWT 的接口必须使用后台登录返回的 token
- 后台 token 与前台用户 token 分离，前端应分别存储

### 6B.1 后台登录

**POST** `/api/v1/admin/auth/login`

#### 请求体

```json
{
  "email": "admin@admin",
  "password": "12345"
}
```

#### 成功响应 `200`

```json
{
  "access_token": "jwt-token",
  "expires_at": 1777700000,
  "admin_id": 1
}
```

说明：

- 当前初始化会自动创建超级管理员 `admin@admin / 12345`
- 后台登录邮箱允许使用内部账号形式，例如 `admin@admin`

### 6B.2 获取当前后台身份

**GET** `/api/v1/admin/auth/me`

需要后台 JWT。

#### 成功响应 `200`

```json
{
  "admin_id": 1,
  "email": "admin@admin",
  "nickname": "admin",
  "avatar_url": "",
  "is_super_admin": true
}
```

### 6B.3 当前后台账号自助改密

**POST** `/api/v1/admin/auth/password/change`

需要后台 JWT。

#### 请求体

```json
{
  "current_password": "12345",
  "new_password": "123456"
}
```

#### 成功响应 `200`

```json
{
  "message": "password changed"
}
```

说明：

- 所有后台账号都可使用该接口修改自己的密码
- 当前密码错误时后端可能返回 `401`，但错误语义是“当前密码校验失败”，不是后台登录态过期
- 后台前端遇到 `invalid current password` 时应提示“当前密码错误”，不得清空本地后台登录态
- 新密码与旧密码相同、密码长度不足等错误应映射为前端中文提示，不直接展示后端原始英文文案

### 6B.4 查询后台账号列表

**GET** `/api/v1/admin/accounts`

需要后台 JWT。

#### 成功响应 `200`

```json
{
  "items": [
    {
      "admin_id": 1,
      "email": "admin@admin",
      "nickname": "admin",
      "avatar_url": "",
      "is_super_admin": true
    }
  ]
}
```

说明：

- 仅超级管理员可用
- 普通后台账号调用会返回 `403`

### 6B.5 创建后台账号

**POST** `/api/v1/admin/accounts`

需要后台 JWT。

#### 请求体

```json
{
  "email": "ops@example.com",
  "password": "ops123",
  "nickname": "运营后台",
  "avatar_url": "",
  "is_super_admin": false
}
```

#### 成功响应 `201`

```json
{
  "admin": {
    "admin_id": 2,
    "email": "ops@example.com",
    "nickname": "运营后台",
    "avatar_url": "",
    "is_super_admin": false
  }
}
```

说明：

- 仅超级管理员可用

### 6B.6 超级管理员重置后台账号密码

**POST** `/api/v1/admin/accounts/:id/password`

需要后台 JWT。

#### 请求体

```json
{
  "new_password": "ops456"
}
```

#### 成功响应 `200`

```json
{
  "message": "password updated"
}
```

说明：

- 仅超级管理员可用
- `:id` 为目标后台账号 ID

### 6B.7 上传后台媒体

**POST** `/api/v1/admin/media/upload`

需要后台 JWT。

#### 请求体

```json
{
  "folder": "groups/5001/gallery",
  "file_name": "macbook-air-hero.jpg",
  "alt_text": "MacBook Air 银色主视觉",
  "mime_type": "image/jpeg",
  "content_base64": "<base64>"
}
```

说明：

- 当前上传接口使用 JSON + base64 承载最小上传能力
- `folder` 由前端按后台当前绑定目标生成
- 上传完成后只会创建媒体资源，不会自动绑定到商品组或独立商品

#### 成功响应 `201`

```json
{
  "media": {
    "id": 9001,
    "storage_key": "groups/5001/gallery/1717132800-123456.jpg",
    "public_url": "/media/groups/5001/gallery/1717132800-123456.jpg",
    "file_name": "macbook-air-hero.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 204800,
    "width": 0,
    "height": 0,
    "alt_text": "MacBook Air 银色主视觉",
    "created_at": 1777700000,
    "updated_at": 1777700000
  }
}
```

### 6B.8 绑定商品组媒体

**POST** `/api/v1/admin/product-groups/:groupId/media`

需要后台 JWT。

#### 请求体

```json
{
  "media_id": 9001,
  "usage_type": "gallery",
  "sort_order": 1,
  "is_primary": true
}
```

说明：

- 商品组当前支持 `cover`、`hero`、`gallery` 三类用途
- 绑定创建成功后，后台前端会重新拉取商品详情真值刷新媒体结果

#### 成功响应 `201`

```json
{
  "binding": {
    "id": 31,
    "group_id": 5001,
    "media_id": 9001,
    "usage_type": "gallery",
    "sort_order": 1,
    "is_primary": true,
    "media": {
      "id": 9001,
      "storage_key": "groups/5001/gallery/1717132800-123456.jpg",
      "public_url": "/media/groups/5001/gallery/1717132800-123456.jpg",
      "file_name": "macbook-air-hero.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 204800,
      "width": 0,
      "height": 0,
      "alt_text": "MacBook Air 银色主视觉",
      "created_at": 1777700000,
      "updated_at": 1777700000
    }
  }
}
```

### 6B.9 绑定独立商品媒体

**POST** `/api/v1/admin/products/:id/media`

需要后台 JWT。

#### 请求体

```json
{
  "media_id": 9002,
  "usage_type": "gallery",
  "sort_order": 2,
  "is_primary": false
}
```

说明：

- 当前独立商品只支持差异图库，因此 `usage_type` 应为 `gallery`

#### 成功响应 `201`

```json
{
  "binding": {
    "id": 41,
    "product_id": 1001001,
    "media_id": 9002,
    "usage_type": "gallery",
    "sort_order": 2,
    "is_primary": false,
    "media": {
      "id": 9002,
      "storage_key": "products/1001001/gallery/1717132801-654321.jpg",
      "public_url": "/media/products/1001001/gallery/1717132801-654321.jpg",
      "file_name": "macbook-air-side.jpg",
      "mime_type": "image/jpeg",
      "size_bytes": 188000,
      "width": 0,
      "height": 0,
      "alt_text": "MacBook Air 侧视图",
      "created_at": 1777700001,
      "updated_at": 1777700001
    }
  }
}
```

### 6B.9A 更新商品组媒体绑定

**PUT** `/api/v1/admin/product-groups/:groupId/media/:bindingId`

需要后台 JWT。

#### 请求体

```json
{
  "usage_type": "gallery",
  "sort_order": 2,
  "is_primary": false
}
```

#### 成功响应 `200`

```json
{
  "binding": {
    "id": 31,
    "group_id": 5001,
    "media_id": 9001,
    "usage_type": "gallery",
    "sort_order": 2,
    "is_primary": false
  }
}
```

### 6B.9B 更新独立商品媒体绑定

**PUT** `/api/v1/admin/products/:id/media/:bindingId`

需要后台 JWT。

请求体与商品组媒体绑定更新一致。

#### 成功响应 `200`

```json
{
  "binding": {
    "id": 41,
    "product_id": 1001001,
    "media_id": 9002,
    "usage_type": "gallery",
    "sort_order": 3,
    "is_primary": false
  }
}
```

### 6B.9G 新建商品组

**POST** `/api/v1/admin/product-groups`

需要后台 JWT。

#### 请求体

```json
{
  "name": "MacBook Air 13",
  "slug": "macbook-air-13",
  "hero_title": "轻薄，迅捷",
  "hero_subtitle": "M4 芯片",
  "hero_image_url": "/media/groups/5001/hero/1717132800-hero.jpg",
  "category_id": 2,
  "status": 1,
  "sort_order": 1,
  "cover_image_url": "/media/groups/5001/cover/1717132800-cover.jpg",
  "spec_keys": ["芯片", "内存", "存储"]
}
```

说明：

- `spec_keys` 为商品组定义的**规格维度名称**（如 `["芯片","内存","存储"]`）。子商品只能在这些维度上填值，不能新增/删除维度
- 可选；不传或传空数组表示该商品组暂未定义规格维度

#### 成功响应 `201`

```json
{
  "group": {
    "id": 5001,
    "name": "MacBook Air 13",
    "slug": "macbook-air-13",
    "hero_title": "轻薄，迅捷",
    "hero_subtitle": "M4 芯片",
    "hero_image_url": "/media/groups/5001/hero/1717132800-hero.jpg",
    "category_id": 2,
    "status": 1,
    "sort_order": 1,
    "cover_image_url": "/media/groups/5001/cover/1717132800-cover.jpg",
    "spec_keys": ["芯片", "内存", "存储"],
    "created_at": 1777702000,
    "updated_at": 1777702000
  }
}
```

### 6B.9H 查询商品组列表

**GET** `/api/v1/product-groups?page=1&page_size=100&category_id=2`

公开接口，当前后台商品页会直接复用。

#### 成功响应 `200`

```json
{
  "items": [
    {
      "id": 5001,
      "name": "MacBook Air 13",
      "slug": "macbook-air-13",
      "hero_title": "轻薄，迅捷",
      "hero_subtitle": "M4 芯片",
      "hero_image_url": "/media/groups/5001/hero/1717132800-hero.jpg",
      "category_id": 2,
      "status": 1,
      "sort_order": 1,
      "cover_image_url": "/media/groups/5001/cover/1717132800-cover.jpg",
      "spec_keys": ["芯片", "内存", "存储"]
    }
  ],
  "total": 1
}
```

### 6B.9I 更新商品组

**PUT** `/api/v1/admin/product-groups/item/:id`

需要后台 JWT。

请求体与新建商品组一致。

#### 成功响应 `200`

```json
{
  "group": {
    "id": 5001,
    "name": "MacBook Air 13",
    "slug": "macbook-air-13",
    "hero_title": "轻薄，迅捷",
    "hero_subtitle": "M4 芯片",
    "hero_image_url": "/media/groups/5001/hero/1717132800-hero.jpg",
    "category_id": 2,
    "status": 1,
    "sort_order": 1,
    "cover_image_url": "/media/groups/5001/cover/1717132800-cover.jpg",
    "spec_keys": ["芯片", "内存", "存储"],
    "created_at": 1777702000,
    "updated_at": 1777702600
  }
}
```

### 6B.9J 删除商品组

**DELETE** `/api/v1/admin/product-groups/item/:id`

需要后台 JWT。

#### 成功响应 `204`

无响应体。

说明：

- 如果商品组下仍有关联独立商品，后端会返回前置条件失败

### 6B.9A 新建独立商品版本

**POST** `/api/v1/admin/products`

需要后台 JWT。

说明：

- 当前后台新建的不是“脱离商品组的单商品”，而是“挂在已有商品组下的独立商品版本”
- `group_id` 必须指向已存在的商品组

#### 请求体

```json
{
  "name": "MacBook Air 13 英寸",
  "description": "M4 芯片，轻薄便携",
  "price": 1099900,
  "category_id": 2,
  "image_url": "/media/products/1001002/gallery/1717132801-654321.jpg",
  "initial_stock": 12,
  "group_id": 5001,
  "spec_label": "16GB / 512GB",
  "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
  "sort_order": 2,
  "status": 1
}
```

#### 成功响应 `201`

```json
{
  "product": {
    "id": 1001002,
    "name": "MacBook Air 13 英寸",
    "description": "M4 芯片，轻薄便携",
    "price": 1099900,
    "category_id": 2,
    "image_url": "/media/products/1001002/gallery/1717132801-654321.jpg",
    "status": 1,
    "stock_quantity": 12,
    "stock_version": 0,
    "group_id": 5001,
    "spec_label": "16GB / 512GB",
    "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
    "sort_order": 2,
    "created_at": 1777701000,
    "updated_at": 1777701000
  }
}
```

### 6B.9B 更新独立商品版本

**PUT** `/api/v1/admin/products/:id`

需要后台 JWT。

#### 请求体

```json
{
  "name": "MacBook Air 13 英寸",
  "description": "M4 芯片，轻薄便携",
  "price": 1099900,
  "category_id": 2,
  "image_url": "/media/products/1001002/gallery/1717132801-654321.jpg",
  "group_id": 5001,
  "spec_label": "16GB / 512GB",
  "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
  "sort_order": 2,
  "status": 1
}
```

#### 成功响应 `200`

```json
{
  "product": {
    "id": 1001002,
    "name": "MacBook Air 13 英寸",
    "description": "M4 芯片，轻薄便携",
    "price": 1099900,
    "category_id": 2,
    "image_url": "/media/products/1001002/gallery/1717132801-654321.jpg",
    "status": 1,
    "stock_quantity": 12,
    "stock_version": 3,
    "group_id": 5001,
    "spec_label": "16GB / 512GB",
    "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
    "sort_order": 2,
    "created_at": 1777701000,
    "updated_at": 1777701200
  }
}
```

### 6B.9C 更新独立商品库存

**PUT** `/api/v1/admin/products/:id/stock`

需要后台 JWT。

说明：

- 当前库存编辑为独立写口，不与商品基础信息更新混用
- `expected_version` 来自最近一次商品详情快照，用于 CAS 并发保护

#### 请求体

```json
{
  "quantity": 20,
  "expected_version": 3
}
```

#### 成功响应 `200`

```json
{
  "stock_quantity": 20,
  "version": 4
}
```

### 6B.9D 删除独立商品版本

**DELETE** `/api/v1/admin/products/:id`

需要后台 JWT。

#### 成功响应 `204`

无响应体。

说明：

- 当前删除的是独立商品版本
- 不会直接删除其所属商品组

### 6B.10 删除商品组媒体绑定

**DELETE** `/api/v1/admin/product-groups/:groupId/media/:bindingId`

需要后台 JWT。

#### 成功响应 `204`

无响应体。

说明：

- 当前删除的是绑定关系，不会直接删除底层媒体文件

### 6B.11 删除独立商品媒体绑定

**DELETE** `/api/v1/admin/products/:id/media/:bindingId`

需要后台 JWT。

#### 成功响应 `204`

无响应体。

说明：

- 当前删除的是绑定关系，不会直接删除底层媒体文件

### 6B.12 后台商品详情媒体字段补充

当前后台前端会直接读取 `GET /api/v1/products/:id` 返回的三组媒体字段：

- `group_medias`
- `product_medias`
- `resolved_medias`

其中每项当前额外包含：

```json
{
  "id": 9001,
  "image_url": "/media/groups/5001/gallery/1717132800-123456.jpg",
  "alt_text": "MacBook Air 银色主视觉",
  "sort_order": 1,
  "is_primary": true,
  "binding_id": 31
}
```

说明：

- `binding_id` 主要供后台媒体页删除绑定时使用
- 前台用户端当前可以忽略该字段

### 6B.13 后台订单列表

**GET** `/api/v1/admin/orders?page=1&page_size=20&status=CREATED&email=alice@test.com`

需要后台 JWT。

#### 查询参数

- `page` / `page_size`：分页，默认 `1` / `20`
- `status`：可选，按订单状态过滤（`CREATED` / `PAID` / `CANCELLED`），不传表示全部
- `email`：可选，按**买家账号邮箱**精确筛选；网关会先把邮箱解析为 `user_id` 再查订单

#### 成功响应 `200`

结构与用户端订单列表一致（`items` + `total`），但**不限定下单用户**，且每项带回 `items` 明细。

```json
{
  "items": [
    {
      "id": 101,
      "order_no": "ORD-20260518140000-1001",
      "user_id": 1001,
      "status": "CREATED",
      "total_amount": 1999800,
      "total_quantity": 2,
      "receiver_name": "张三",
      "created_at": 1778479200,
      "items": [
        { "id": 1, "product_id": 1001002, "name": "MacBook Air", "price": 999900, "quantity": 2, "amount": 1999800 }
      ]
    }
  ],
  "total": 1
}
```

说明：

- 仅后台管理员可用，跨用户聚合全部订单
- `email` 对应的账号不存在时，直接返回空列表（`items` 为空、`total` 为 0）
- 列表查询会自动收敛已超时的待支付订单为 `CANCELLED`
- 当前后台订单页用该接口驱动订单列表、状态筛选、买家邮箱精确筛选与最近订单展示

### 6B.14 后台订单详情

**GET** `/api/v1/admin/orders/:id`

需要后台 JWT。

#### 成功响应 `200`

```json
{
  "order": {
    "id": 101,
    "order_no": "ORD-20260518150000-1001",
    "user_id": 1001,
    "status": "CREATED",
    "total_amount": 1999800,
    "items": []
  }
}
```

说明：

- 管理员可查询任意订单，不校验订单归属
- 响应结构与用户端订单详情一致

### 6B.15 后台关闭订单

**POST** `/api/v1/admin/orders/:id/cancel`

需要后台 JWT。

#### 成功响应 `200`

```json
{
  "order": {
    "id": 101,
    "order_no": "ORD-20260518150000-1001",
    "status": "CANCELLED",
    "items": []
  }
}
```

说明：

- 管理员关闭任意未支付（`CREATED`）订单，会回补库存并投递订单取消事件
- 当前仅 `CREATED` 状态可关闭，其它状态返回 `412`
- 关闭原因在后端记为 `ADMIN_CLOSED`，对外状态统一表现为 `CANCELLED`

### 6B.16 后台总览数据来源

当前后台总览页没有独立 Dashboard 聚合接口，而是由后台前端复用已有接口组合展示。

#### 当前数据来源

- 商品组数量：`GET /api/v1/product-groups`
- 独立商品数量：`GET /api/v1/products`
- 最近订单：`GET /api/v1/admin/orders?page=1&page_size=2`
- 后台账号数量：`GET /api/v1/admin/accounts`

说明：

- `GET /api/v1/admin/accounts` 仅超级管理员可用，普通后台账号不具备该统计权限
- 普通后台账号进入总览页时，账号数量应允许降级展示，不应影响订单与商品统计
- 最近订单当前最多展示两条，避免订单量增长后破坏后台首页排版

---

## 6A. 订单接口

### 6A.1 创建订单

**POST** `/api/v1/orders`

需要 JWT。

#### 请求体

```json
{
  "request_id": "req-001",
  "product_id": 1001002,
  "quantity": 1,
  "address_id": 12
}
```

字段说明：

- `request_id`：前端生成的幂等请求 ID；同一次重试必须复用同一个值
- `product_id`：后端独立商品 ID，价格和规格最终以后端商品真值为准
- `quantity`：当前购买数量，必须大于 `0`
- `address_id`：当前登录用户地址簿中的地址 ID；Gateway 会先读取地址簿，再把地址快照写入订单

当前前端购物车页结算方式：

- 用户填写一份统一收货信息
- 前端遍历购物车条目，逐条调用本接口
- 每个购物车条目会生成一笔独立订单
- 成功条目会从购物车移除
- 中途失败时，前端会停止后续提交并保留剩余条目

#### 成功响应 `201`

```json
{
  "order": {
    "id": 101,
    "order_no": "ORD-20260518140000-1001",
    "user_id": 1001,
    "request_id": "req-001",
    "status": "CREATED",
    "total_amount": 1999800,
    "total_quantity": 2,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "created_at": 1778479200,
    "updated_at": 1778479200,
    "items": [
      {
        "id": 1,
        "order_id": 101,
        "product_id": 1001002,
        "name": "MacBook Air",
        "image_url": "https://example.com/macbook-air.png",
        "option_summary": "M4 / 16GB / 512GB",
        "price": 999900,
        "quantity": 2,
        "amount": 1999800
      }
    ]
  }
}
```

#### 常见失败状态

- `400`：参数错误，如 `request_id` 为空、`product_id <= 0`、`quantity <= 0`
- `401`：未登录
- `404`：商品不存在或地址不存在
- `409`：重复请求
- `412`：商品不可售或库存不足

#### 当前行为补充

- 订单创建成功后初始状态固定为 `CREATED`
- 订单服务内部会为待支付订单写入支付超时时间
- 当前对外接口暂不返回 `expire_at`、`closed_at`、`close_reason`
- `items[].option_summary` 当前仅作为版本/规格摘要展示字段返回，不代表旧 SKU 主链路仍在使用
- 若订单已超时，后续用户再次查询订单详情或订单列表时，接口会把订单状态自动收敛为 `CANCELLED`
- 当前库存协作直接按 `product_id + quantity` 调用后端库存接口

### 6A.2 查询订单详情

**GET** `/api/v1/orders/:id`

需要 JWT。

#### 路径参数

- `id`：订单 ID，必须为正整数

#### 成功响应 `200`

```json
{
  "order": {
    "id": 101,
    "order_no": "ORD-20260518150000-1001",
    "user_id": 1001,
    "request_id": "req-001",
    "status": "CREATED",
    "total_amount": 1999800,
    "total_quantity": 2,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "created_at": 1778479800,
    "updated_at": 1778479800,
    "items": [
      {
        "id": 1,
        "order_id": 101,
        "product_id": 1001002,
        "name": "MacBook Air",
        "image_url": "https://example.com/macbook-air.png",
        "option_summary": "M4 / 16GB / 512GB",
        "price": 999900,
        "quantity": 2,
        "amount": 1999800
      }
    ]
  }
}
```

#### 常见失败状态

- `400`：订单 ID 非法
- `401`：未登录
- `403`：订单不属于当前用户
- `404`：订单不存在

#### 当前行为补充

- 若订单仍为 `CREATED` 且已超过后端支付保留时间，本接口会在读取前自动关闭该订单
- 自动关闭后的对外状态仍为 `CANCELLED`
- 当前前端接口暂不直接返回关闭原因；若后端内部是用户取消、支付失败或超时关闭，前端目前统一只看到 `CANCELLED`

### 6A.3 查询订单列表

**GET** `/api/v1/orders?page=1&page_size=20`

需要 JWT。

#### 查询参数

- `page`：页码，默认 `1`
- `page_size`：每页条数，默认 `20`

#### 成功响应 `200`

```json
{
  "items": [
    {
      "id": 103,
      "order_no": "ORD-003",
      "user_id": 1001,
      "request_id": "req-003",
      "status": "CREATED",
      "total_amount": 1999800,
      "total_quantity": 2,
      "receiver_name": "张三",
      "receiver_phone": "13800138000",
      "province": "上海市",
      "city": "上海市",
      "district": "浦东新区",
      "address_line": "世纪大道 100 号 18 层",
      "postal_code": "200120",
      "created_at": 1778479900,
      "updated_at": 1778479900,
      "items": []
    },
    {
      "id": 102,
      "order_no": "ORD-002",
      "user_id": 1001,
      "request_id": "req-002",
      "status": "CREATED",
      "total_amount": 999900,
      "total_quantity": 1,
      "receiver_name": "张三",
      "receiver_phone": "13800138000",
      "province": "上海市",
      "city": "上海市",
      "district": "浦东新区",
      "address_line": "世纪大道 100 号 18 层",
      "postal_code": "200120",
      "created_at": 1778479700,
      "updated_at": 1778479700,
      "items": []
    }
  ],
  "total": 3
}
```

#### 当前能力边界

- 当前按单个独立商品版本下单
- 当前已开放创建订单、订单详情、订单列表、取消订单
- 当前已开放支付查询与 mock 支付确认
- 商品价格、名称、规格摘要全部以后端 Order / Product 返回为准，前端不参与计算
- 列表查询和详情查询都会自动收敛已超时的待支付订单
- 当前自动关闭后的订单对外状态统一表现为 `CANCELLED`

### 6A.4 取消订单

**POST** `/api/v1/orders/:id/cancel`

需要 JWT。

#### 路径参数

- `id`：订单 ID，必须为正整数

#### 成功响应 `200`

```json
{
  "order": {
    "id": 201,
    "order_no": "ORD-CANCEL-201",
    "user_id": 1001,
    "request_id": "req-cancel-201",
    "status": "CANCELLED",
    "total_amount": 999900,
    "total_quantity": 1,
    "receiver_name": "张三",
    "receiver_phone": "13800138000",
    "province": "上海市",
    "city": "上海市",
    "district": "浦东新区",
    "address_line": "世纪大道 100 号 18 层",
    "postal_code": "200120",
    "created_at": 1778480200,
    "updated_at": 1778480800,
    "items": [
      {
        "id": 1,
        "order_id": 201,
        "product_id": 1001002,
        "name": "MacBook Air",
        "image_url": "https://example.com/macbook-air.png",
        "option_summary": "M4 / 16GB / 512GB",
        "price": 999900,
        "quantity": 1,
        "amount": 999900
      }
    ]
  }
}
```

#### 常见失败状态

- `400`：订单 ID 非法
- `401`：未登录
- `403`：订单不属于当前用户
- `404`：订单不存在
- `412`：当前订单状态不可取消

#### 当前行为补充

- 当前仅 `CREATED` 状态订单可取消
- 若订单已经因支付失败或支付超时被系统自动关闭，再调用本接口会返回 `412`

### 6A.5 查询支付单详情

**GET** `/api/v1/payments/:id`

需要 JWT。

#### 路径参数

- `id`：支付单 ID，必须为正整数

#### 成功响应 `200`

```json
{
  "payment": {
    "id": 301,
    "payment_no": "PAY-20260525120000-101",
    "order_id": 101,
    "order_no": "ORD-20260525115900-1001",
    "user_id": 1001,
    "amount": 999900,
    "status": "PENDING",
    "channel": "MOCK",
    "created_at": 1779681600,
    "updated_at": 1779681600,
    "paid_at": 0
  }
}
```

#### 常见失败状态

- `400`：支付单 ID 非法
- `401`：未登录
- `403`：支付单不属于当前用户
- `404`：支付单不存在

#### 当前行为补充

- `status` 当前可能为 `PENDING`、`SUCCEEDED`、`FAILED`、`CANCELLED`
- 若关联订单已经被用户取消、支付失败关闭或支付超时自动关闭，对应待支付支付单会被后端自动收敛为 `CANCELLED`
- `CANCELLED` 状态表示该支付单已经失效，前端不应再提供继续支付入口

### 6A.6 按订单查询支付单

**GET** `/api/v1/payments/by-order/:orderId`

需要 JWT。

#### 路径参数

- `orderId`：订单 ID，必须为正整数

#### 成功响应 `200`

响应结构与 `GET /api/v1/payments/:id` 相同。

#### 常见失败状态

- `400`：订单 ID 非法
- `401`：未登录
- `403`：该订单对应的支付单不属于当前用户
- `404`：支付单不存在

#### 当前行为补充

- 若订单仍处于正常待支付状态，本接口通常返回 `PENDING`
- 若订单已经进入关闭态，且支付单此前仍为待支付，本接口会返回已被后端自动收敛后的 `CANCELLED`

### 6A.7 模拟确认支付结果

**POST** `/api/v1/payments/:id/mock-confirm`

需要 JWT。

#### 路径参数

- `id`：支付单 ID，必须为正整数

#### 请求体

```json
{
  "result": "SUCCESS"
}
```

`result` 当前支持：

- `SUCCESS`
- `FAILED`

#### 成功响应 `200`

```json
{
  "payment": {
    "id": 301,
    "payment_no": "PAY-20260525120000-101",
    "order_id": 101,
    "order_no": "ORD-20260525115900-1001",
    "user_id": 1001,
    "amount": 999900,
    "status": "SUCCEEDED",
    "channel": "MOCK",
    "created_at": 1779681600,
    "updated_at": 1779681900,
    "paid_at": 1779681900
  }
}
```

#### 常见失败状态

- `400`：请求体格式错误、`result` 不支持或支付单 ID 非法
- `401`：未登录
- `403`：支付单不属于当前用户
- `404`：支付单不存在
- `412`：当前支付单状态不可重复确认

#### 当前行为补充

- 只有 `PENDING` 支付单允许执行 mock 支付确认
- 若支付单已经被订单关闭事件自动推进为 `CANCELLED`，本接口会返回 `412`

---

### 6.2 创建类目

**POST** `/api/v1/admin/categories`

需要后台 JWT。

#### 请求体

```json
{
  "name": "数码",
  "sort_order": 1
}
```

#### 成功响应 `201`

```json
{
  "category": {
    "id": 1,
    "name": "数码",
    "sort_order": 1,
    "created_at": 1777365000,
    "updated_at": 1777365000
  }
}
```

---

### 6.3 更新类目

**PUT** `/api/v1/admin/categories/:id`

需要后台 JWT。

#### 请求体

```json
{
  "name": "数码家电",
  "sort_order": 2
}
```

#### 成功响应 `200`

```json
{
  "category": {
    "id": 1,
    "name": "数码家电",
    "sort_order": 2,
    "created_at": 1777365000,
    "updated_at": 1777365600
  }
}
```

---

### 6.4 删除类目

**DELETE** `/api/v1/admin/categories/:id`

需要后台 JWT。

#### 成功响应 `200`

```json
{}
```

#### 注意

- 当前实现不会因类目下仍有关联商品组而阻止删除；后端会先把这些商品组的 `category_id` 置空
- 如果删除前该类目下存在商品组，响应会返回：

```json
{
  "warning": "该类目下含有商品组"
}
```

---

## 7. 商品接口

### 7.1 查询商品列表

**GET** `/api/v1/products`

公开接口，无需登录。

#### 查询参数

- `category_id`：类目 ID，可选，`0` 或不传表示不过滤
- `page`：页码，从 `1` 开始，默认 `1`
- `page_size`：每页大小，默认 `20`

#### 示例

```http
GET /api/v1/products?page=1&page_size=10&category_id=1
```

#### 成功响应 `200`

```json
{
  "items": [
    {
      "id": 1001001,
      "name": "MacBook Air",
      "description": "轻薄笔记本产品线测试数据，采用 MacBook Air 公开售价与公开商品图，适合首页与商品卡片陈列。",
      "price": 849900,
      "category_id": 1,
      "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
      "cover_image_url": "/media/groups/5001/library/macbook-air-cover.jpg",
      "status": 1,
      "group_id": 5001,
      "spec_label": "M4 / 16GB / 256GB",
      "spec_values_json": "{\"chip\":\"M4\",\"memory\":\"16GB\",\"storage\":\"256GB\"}",
      "sort_order": 1,
      "created_at": 1777365000,
      "updated_at": 1777365000
    }
  ],
  "total": 1
}
```

说明：

- 列表接口中的商品项**通常不带库存字段**
- `price` 单位为**分**
- 在新的产品定位下，这个接口更适合作为“精品商品列表 / 系列商品陈列”接口使用，而不是海量平台商品流
- 商品卡片显示的 `price` 应理解为默认展示价 / 当前独立商品售价，不应替代用户切换版本后的最终价格
- 当前返回项本质上仍是“独立商品版本”，同一产品系列可能共享同一个 `group_id`
- 前端当前会按 `group_id` 把同系列版本聚合为一张卡片，只保留一个默认展示入口，版本切换放到详情页或加购选配中完成
- `cover_image_url` 为商品组级列表封面图，前端商品卡片应优先使用该字段，其次回退到 `image_url`

---

### 7.2 查询商品详情

**GET** `/api/v1/products/:id`

公开接口，无需登录。

#### 成功响应 `200`

```json
{
  "product": {
    "id": 1001002,
    "name": "MacBook Air",
    "description": "M4 芯片轻薄笔记本",
    "price": 999900,
    "category_id": 1,
    "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
    "status": 1,
    "stock_quantity": 8,
    "created_at": 1777365000,
    "updated_at": 1777365000,
    "group_id": 1001,
    "spec_label": "M4 / 16GB / 512GB",
    "spec_values_json": "{\"chip\":\"M4\",\"memory\":\"16GB\",\"storage\":\"512GB\"}",
    "sort_order": 2
  },
  "group": {
    "id": 1001,
    "name": "MacBook Air",
    "slug": "macbook-air",
    "hero_title": "MacBook Air",
    "hero_subtitle": "轻薄与性能并进",
    "hero_image_url": "/media/groups/5001/library/macbook-air-hero.jpg",
    "cover_image_url": "/media/groups/5001/library/macbook-air-cover.jpg",
    "category_id": 1,
    "status": 1,
    "sort_order": 1,
    "spec_keys": ["芯片", "内存", "存储"]
  },
  "variants": [
    {
      "id": 1001001,
      "spec_label": "M4 / 16GB / 256GB",
      "spec_values_json": "{\"chip\":\"M4\",\"memory\":\"16GB\",\"storage\":\"256GB\"}",
      "image_url": "https://example.com/macbook-air.png",
      "price": 849900,
      "stock_quantity": 12,
      "status": 1
    },
    {
      "id": 1001002,
      "spec_label": "M4 / 16GB / 512GB",
      "spec_values_json": "{\"chip\":\"M4\",\"memory\":\"16GB\",\"storage\":\"512GB\"}",
      "image_url": "https://example.com/macbook-air.png",
      "price": 999900,
      "stock_quantity": 8,
      "status": 1
    }
  ],
  "default_product_id": 1001001,
  "group_medias": [
    {
      "id": 9001,
      "image_url": "/media/groups/5001/library/macbook-air-cover.jpg",
      "alt_text": "MacBook Air 封面图",
      "sort_order": 1,
      "is_primary": true,
      "binding_id": 31
    }
  ],
  "product_medias": [],
  "resolved_medias": [
    {
      "id": 9001,
      "image_url": "/media/groups/5001/library/macbook-air-cover.jpg",
      "alt_text": "MacBook Air 封面图",
      "sort_order": 1,
      "is_primary": true,
      "binding_id": 31
    }
  ]
}
```

说明：

- 详情接口会返回 `stock_quantity`
- 详情接口已经扩展为 `product + group + variants` 结构
- 前端必须直接消费 `group`、`variants` 与 `default_product_id`
- 前端不应自行推导价格或库存，只负责展示和提交所选 `product_id`
- 建议前端把该接口作为“精品单品详情页”的核心数据来源，重点展示图片、价格、可选配置与简洁描述
- 前端当前会基于后端返回的真实 `variants` 集合做选配，不要求规格值组成完整笛卡尔积
- 当 `variants` 为空时，前端当前会回退为“当前商品即唯一版本”的单版本展示，而不是向用户暴露内部异常提示
- 当商品有库存时，前端不向用户展示剩余库存数量，仅在当前版本 `stock_quantity <= 0` 时提示缺货
- 详情接口当前还会返回 `group_medias`、`product_medias`、`resolved_medias`，供前台详情图库与后台媒体编辑共用
- `group.spec_keys` 为商品组定义的规格维度名称：后台子商品页据此渲染只读维度名、仅允许填值；子商品的 `spec_label` 由各维度的值按顺序自动拼接

---

### 7.3 创建商品

**POST** `/api/v1/admin/products`

需要后台 JWT。

#### 请求体

```json
{
  "name": "Phone",
  "description": "旗舰手机",
  "price": 99900,
  "category_id": 1,
  "image_url": "",
  "initial_stock": 100,
  "group_id": 5001,
  "spec_label": "16GB / 512GB",
  "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
  "sort_order": 1,
  "status": 1
}
```

#### 成功响应 `201`

```json
{
  "product": {
    "id": 1,
    "name": "Phone",
    "description": "旗舰手机",
    "price": 99900,
    "category_id": 1,
    "image_url": "",
    "status": 1,
    "stock_quantity": 100,
    "created_at": 1777365000,
    "updated_at": 1777365000
  }
}
```

---

### 7.4 更新商品

**PUT** `/api/v1/admin/products/:id`

需要后台 JWT。

#### 请求体

```json
{
  "name": "Phone Pro",
  "description": "升级版旗舰手机",
  "price": 109900,
  "category_id": 1,
  "image_url": "",
  "group_id": 5001,
  "spec_label": "16GB / 512GB",
  "spec_values_json": "{\"ram\":\"16GB\",\"storage\":\"512GB\"}",
  "sort_order": 1,
  "status": 1
}
```

#### 成功响应 `200`

```json
{
  "product": {
    "id": 1,
    "name": "Phone Pro",
    "description": "升级版旗舰手机",
    "price": 109900,
    "category_id": 1,
    "image_url": "",
    "status": 1,
    "stock_quantity": 0,
    "created_at": 1777365000,
    "updated_at": 1777365600
  }
}
```

说明：

- 当前更新响应里的 `stock_quantity` 不应作为前端库存真值来源
- 前端如需最新库存，应再次调用商品详情接口

---

### 7.5 删除商品

**DELETE** `/api/v1/admin/products/:id`

需要后台 JWT。

#### 成功响应 `204`

无响应体。

#### 注意

- 当前实现是**软删除**
- 删除后再次查询商品详情，应返回 `404`

---

## 8. 当前未开放给前端的能力

以下能力在系统设计中存在，但目前前端**不应依赖**：

- 库存直接修改接口
- 内部库存扣减 / 回补接口
- 秒杀结果查询接口

这些内容属于内部能力或后台能力，不会直接作为普通前台页面接口使用。

在新的精品电子商店定位下，以下能力仍可能继续降低优先级，不应抢在商品展示主线之前：

- 复杂购物车
- 平台式搜索排序
- 收藏 / 评价 / 社交互动

---

## 9. 购物车接口

### 9.1 查询购物车

**GET** `/api/v1/cart`

需要 JWT。

#### 成功响应 `200`

```json
{
  "items": [
    {
      "cart_item_id": "1001001::TTQgLyAxNkdCIC8gMjU2R0I",
      "product_id": 1001001,
      "name": "MacBook Air",
      "price": 849900,
      "quantity": 1,
      "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
      "option_summary": "M4 / 16GB / 256GB",
      "status": 1,
      "available": true,
      "unavailable_reason": ""
    }
  ],
  "total_quantity": 1,
  "total_amount": 849900
}
```

说明：

- 购物车条目当前按真实独立商品版本维度存储与展示
- `option_summary` 为后端生成的版本/规格摘要，前端只负责展示
- 当前前端展示层以 `name` 作为主信息，`option_summary` 作为次级配置说明
- `price` 为该商品版本的后端权威价格，前端不可自行重算

### 9.2 加入购物车

**POST** `/api/v1/cart/items`

需要 JWT。

#### 请求体

```json
{
  "product_id": 1001001,
  "quantity": 1
}
```

#### 成功响应 `201`

```json
{
  "items": [
    {
      "cart_item_id": "1001001::TTQgLyAxNkdCIC8gMjU2R0I",
      "product_id": 1001001,
      "name": "MacBook Air",
      "price": 849900,
      "quantity": 1,
      "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
      "option_summary": "M4 / 16GB / 256GB",
      "status": 1,
      "available": true,
      "unavailable_reason": ""
    }
  ],
  "total_quantity": 1,
  "total_amount": 849900
}
```

说明：

- 前端当前统一只上传 `product_id + quantity`
- 不再上传 `price`、`option_summary` 作为权威数据；版本摘要统一以后端返回为准
- 未登录时，前端不会直接调该接口，而是先提示原因并跳转登录页
- 登录成功后，商品详情页会回跳到原商品；列表页加购会回跳到最后点击的商品详情页
- 商品列表页若存在同系列多个版本，前端会先读取详情接口并让用户选择具体版本，再提交最终 `product_id`

### 9.3 修改购物车数量

**PUT** `/api/v1/cart/items/:productId`

需要 JWT。

#### 请求体

```json
{
  "quantity": 2
}
```

#### 成功响应 `200`

```json
{
  "items": [
    {
      "cart_item_id": "1001001::TTQgLyAxNkdCIC8gMjU2R0I",
      "product_id": 1001001,
      "name": "MacBook Air",
      "price": 849900,
      "quantity": 2,
      "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
      "option_summary": "M4 / 16GB / 256GB",
      "status": 1,
      "available": true,
      "unavailable_reason": ""
    }
  ],
  "total_quantity": 2,
  "total_amount": 1699800
}
```

说明：

- 路由参数当前虽然命名为 `productId`，实际应传购物车条目标识 `cart_item_id`
- 前端当前直接使用返回的新购物车快照覆盖本地状态
- 若数量减到 `0` 或更小，前端会转而调用删除接口

### 9.4 删除购物车条目

**DELETE** `/api/v1/cart/items/:productId`

需要 JWT。

#### 成功响应 `204`

无响应体。

说明：

- 路由参数当前虽然命名为 `productId`，实际应传购物车条目标识 `cart_item_id`
- 前端删除成功后会重新拉取一次购物车，确保页面与后端状态一致
- 操作失败时，前端使用顶部轻提示反馈，不在正文区域长期插入错误块

---

## 10. 收藏接口

### 10.1 查询收藏列表

**GET** `/api/v1/favorites`

需要 JWT。

#### 成功响应 `200`

```json
{
  "items": [
    {
      "product_id": 1001001,
      "name": "MacBook Air",
      "description": "轻薄笔记本产品线测试数据",
      "price": 849900,
      "category_id": 1,
      "image_url": "/media/groups/5001/library/macbook-air-main.jpg",
      "status": 1,
      "favorited_at": 1777700000,
      "available": true,
      "unavailable_reason": ""
    }
  ],
  "total": 1
}
```

说明：

- 收藏持久层只保存 `user_id + product_id + created_at`
- 商品名称、价格、图片等展示信息在查询时由后端实时补齐
- 若商品已删除或已下线，收藏记录仍保留，但会返回 `available = false` 和明确失效提示

### 10.2 加入收藏

**POST** `/api/v1/favorites`

需要 JWT。

#### 请求体

```json
{
  "product_id": 1001001
}
```

#### 成功响应 `201`

响应结构与 `GET /api/v1/favorites` 相同。

### 10.3 取消收藏

**DELETE** `/api/v1/favorites/:productId`

需要 JWT。

#### 成功响应 `204`

无响应体。

---

## 11. 秒杀活动接口

本章接口保留在 Gateway 中，但当前定位为：

- 仅后台管理联调使用
- 主要用于验证 Redis 预热、库存预扣、限流与异步削峰链路
- 不再作为用户前台页面接口

### 11.1 查询秒杀活动

**GET** `/api/v1/seckill/activities/:id`

公开接口，无需登录。

#### 成功响应 `200`

```json
{
  "activity": {
    "id": 1,
    "product_id": 3,
    "title": "秒杀活动",
    "seckill_price": 9900,
    "seckill_stock": 3,
    "status": 2,
    "start_at": 1777485600,
    "end_at": 1777489200,
    "created_at": 1777482000,
    "updated_at": 1777482000
  }
}
```

字段说明：

- `seckill_price`：秒杀价，单位为分
- `seckill_stock`：活动库存配额
- `status`：当前状态，`1=draft`、`2=active`、`3=disabled`
- `start_at` / `end_at`：Unix 秒时间戳

语义建议：

- 管理端可将秒杀活动理解为“高并发活动配置与演练对象”
- 不建议把当前活动页做成综合平台大促会场风格

---

### 9.2 预热秒杀活动

**POST** `/api/v1/seckill/activities/:id/prewarm`

需要 JWT。

#### 成功响应 `200`

```json
{
  "activity_id": 1,
  "meta_key": "seckill:activity:1:meta",
  "stock_key": "seckill:activity:1:stock"
}
```

说明：

- 当前接口主要用于后台联调、运营预热或测试，不是普通用户抢购前必须主动调用的前端接口
- 如果活动不存在或状态不满足预热条件，可能返回 `404` 或 `412`

---

### 9.3 秒杀抢购

**POST** `/api/v1/seckill/activities/:id/purchase`

需要 JWT。

#### 请求体

```json
{
  "request_id": "frontend-unique-request-id",
  "quantity": 1
}
```

字段说明：

- `request_id`：前端生成的唯一请求 ID；同一次重试必须复用同一个值
- `quantity`：当前仅支持 `1`

#### 成功响应 `202`

```json
{
  "queued": true,
  "request_id": "frontend-unique-request-id",
  "activity_id": 1,
  "product_id": 3,
  "subject": "seckill.order",
  "queued_at": 1777482300,
  "quantity": 1,
  "remaining": 2
}
```

说明：

- `202` 表示请求已进入异步排队，不代表订单已经最终创建成功
- 当前阶段前台不消费该接口；若后台管理页面接入，当前也仍只能拿到排队结果

#### 常见失败状态

- `400`：参数错误，例如 `request_id` 为空或 `quantity != 1`
- `401`：未登录
- `404`：活动不存在
- `409`：重复请求或库存不足
- `412`：活动未开始、已结束或尚未预热
