# GoBao 内部接口文档

- **文档定位**：面向后端服务开发、服务间联调、后续迭代实现
- **更新时间**：2026-06-03

---

## 1. 说明

当前项目的产品定位已经调整为：

**以电子产品为主、强调简约与高级感的精品在线商店。**

因此，本文件中的内部服务能力应默认按以下语义理解：

- Product：精品电子商品域
- Category：产品线/系列分类
- Seckill：新品发售 / 限量精选活动
- Order：精品商品购买订单链路
- Payment：精品商品支付闭环
- Admin：独立后台账号与运营管理域

当前系统形态为“Go 微服务 + Gateway + 用户端前端 + 独立后台管理前端”：

- Gateway 是前端访问后端的唯一 HTTP 入口，用户端与后台端都不直接调用内部微服务
- 后端服务之间默认不允许随意互相直连，必须走已定义的 gRPC 契约、Gateway 编排或事件流
- 用户端前端只展示和提交后端返回的业务真值，不自行计算价格、库存、订单金额或支付状态
- 后台管理前端可以编辑商品展示、媒体、类目、订单和后台账号，但保存后仍以后端返回数据为准
- 商品域当前采用“商品组 + 独立商品版本”模型：商品组承载页面聚合和封面卡片，独立商品版本承载规格、价格、库存与购买状态

本次调整主要是**产品语义与文档口径同步**，不是对已实现协议做破坏性重写。

本文件记录两类内部接口：

1. **当前已经实现的内部接口**
   - User gRPC
   - Product gRPC
   - Gateway 秒杀 HTTP 入口（依赖 Product gRPC + Redis + NATS）
2. **系统设计文档中已规划并开始落地的内部契约**
   - Order gRPC（创建订单已实现）
   - Payment gRPC（最小闭环已实现）
   - 部分 NATS 事件流（规划/部分已接入）

状态标记：

- `已实现`：代码和运行链路已存在
- `已定义未接入`：契约存在，但调用链路未完全启用
- `规划中`：仅来自总设计文档，代码尚未落地

---

## 2. 通用约定

### 2.1 服务间通信

- 外部入口：`Gateway HTTP`
- 服务间同步调用：`gRPC`
- 服务间异步通信：`NATS JetStream`

### 2.2 错误语义

当前服务内部统一错误语义主要基于 `gobao-pkg/errors`：

- `INVALID_ARGUMENT`
- `UNAUTHENTICATED`
- `PERMISSION_DENIED`
- `NOT_FOUND`
- `CONFLICT`
- `RESOURCE_EXHAUSTED`
- `FAILED_PRECONDITION`
- `ABORTED`
- `INTERNAL`
- `UNAVAILABLE`

其中对后续交易链路最关键的是：

- `FAILED_PRECONDITION`：业务前置条件不满足，如库存不足、类目仍被引用
- `ABORTED`：并发冲突，如库存 CAS 失败

---

## 3. User Service gRPC

- **服务名**：`gobao.user.v1.UserService`
- **状态**：`已实现`
- **调用方**：
  - Gateway（已接入）
  - 其他内部服务（可复用）

### 3.1 Register

```proto
rpc Register(RegisterRequest) returns (RegisterResponse);
```

#### 请求

```proto
message RegisterRequest {
  string email = 1;
  string password = 2;
  string nickname = 3;
}
```

#### 响应

```proto
message RegisterResponse {
  int64 user_id = 1;
}
```

#### 用途

- 创建新用户
- 供 Gateway 注册接口转发

---

### 3.2 Login

```proto
rpc Login(LoginRequest) returns (LoginResponse);
```

#### 请求

```proto
message LoginRequest {
  string email = 1;
  string password = 2;
}
```

#### 响应

```proto
message LoginResponse {
  string access_token = 1;
  int64 expires_at = 2;
  int64 user_id = 3;
}
```

#### 用途

- 用户登录
- 由 Gateway 转发给前端

---

### 3.3 VerifyToken

```proto
rpc VerifyToken(VerifyTokenRequest) returns (VerifyTokenResponse);
```

#### 当前状态

- `已实现`
- Gateway 当前鉴权逻辑主要使用本地 JWT 校验，未依赖每次 RPC 校验

#### 请求 / 响应

```proto
message VerifyTokenRequest {
  string access_token = 1;
}

message VerifyTokenResponse {
  int64 user_id = 1;
  string email = 2;
}
```

#### 用途

- 作为内部统一 token 校验能力保留
- 适合未来非 Gateway 场景复用

---

### 3.4 GetUser

```proto
rpc GetUser(GetUserRequest) returns (GetUserResponse);
```

#### 请求 / 响应

```proto
message GetUserRequest {
  int64 user_id = 1;
}

message GetUserResponse {
  int64 user_id = 1;
  string email = 2;
  string nickname = 3;
  google.protobuf.Timestamp created_at = 4;
}
```

#### 用途

- Gateway `/auth/me`
- 后续订单、支付等服务需要补充用户展示信息时可复用

### 3.4B FindUserByEmail

```proto
rpc FindUserByEmail(FindUserByEmailRequest) returns (FindUserByEmailResponse);
```

#### 请求 / 响应

```proto
message FindUserByEmailRequest {
  string email = 1;
}

message FindUserByEmailResponse {
  bool found = 1;
  int64 user_id = 2;
  string email = 3;
  string nickname = 4;
}
```

#### 用途

- 供后台订单按买家邮箱筛选时把邮箱解析为 `user_id`
- 邮箱精确匹配；未找到时返回 `found=false` 而非错误，由调用方决定语义

### 3.5 GetProfile

```proto
rpc GetProfile(GetProfileRequest) returns (GetProfileResponse);
```

#### 请求 / 响应

```proto
message GetProfileRequest {
  int64 user_id = 1;
}

message GetProfileResponse {
  int64 user_id = 1;
  string email = 2;
  string nickname = 3;
  string avatar_url = 4;
}
```

#### 用途

- Gateway `/profile`
- 前端 `/profile/account` 二级个人页

### 3.6 UpdateProfile

```proto
rpc UpdateProfile(UpdateProfileRequest) returns (UpdateProfileResponse);
```

#### 请求 / 响应

```proto
message UpdateProfileRequest {
  int64 user_id = 1;
  string nickname = 2;
  string avatar_url = 3;
}

message UpdateProfileResponse {
  int64 user_id = 1;
  string email = 2;
  string nickname = 3;
  string avatar_url = 4;
}
```

#### 用途

- Gateway `PUT /profile`
- 用于修改昵称与头像地址（头像也可经 `UploadAvatar` 上传后回写）

### 3.6B UploadAvatar

```proto
rpc UploadAvatar(UploadAvatarRequest) returns (UploadAvatarResponse);
```

#### 请求 / 响应

```proto
message UploadAvatarRequest {
  int64 user_id = 1;
  string file_name = 2;
  string mime_type = 3;
  bytes content = 4;
}

message UploadAvatarResponse {
  int64 user_id = 1;
  string email = 2;
  string nickname = 3;
  string avatar_url = 4;
}
```

#### 用途

- Gateway `POST /api/v1/profile/avatar`
- 校验图片类型与大小（仅 `image/*`，上限 5MB），由 **user 服务**自有本地存储保存文件并回写 `avatar_url`
- 文件经 user 服务 HTTP 的 `/avatars/` 静态前缀对外暴露；存储根目录与前缀由 `USER_AVATAR_ROOT` / `USER_AVATAR_BASE_URL` 配置

### 3.7 SendPasswordResetCode

```proto
rpc SendPasswordResetCode(SendPasswordResetCodeRequest) returns (SendPasswordResetCodeResponse);
```

#### 请求 / 响应

```proto
message SendPasswordResetCodeRequest {
  int64 user_id = 1;
}

message SendPasswordResetCodeResponse {
  string message = 1;
}
```

#### 用途

- Gateway `POST /api/v1/profile/password/code`
- 当前验证码写入 Redis 并打印到 `user` 服务日志，供前后端联调

### 3.7B GetPasswordResetCode

```proto
rpc GetPasswordResetCode(GetPasswordResetCodeRequest) returns (GetPasswordResetCodeResponse);
```

#### 请求 / 响应

```proto
message GetPasswordResetCodeRequest {
  int64 user_id = 1;
}

message GetPasswordResetCodeResponse {
  string code = 1;
}
```

#### 用途

- Gateway `GET /api/v1/profile/password/code`（受 `GATEWAY_EXPOSE_DEV_ENDPOINTS` 开关控制，默认关闭）
- **仅开发/演示**：从 Redis 读回当前用户待用的改密验证码；key 不存在返回 `NotFound`
- 生产环境必须关闭，避免绕过邮箱验证带来账号安全风险

### 3.8 ChangePassword

```proto
rpc ChangePassword(ChangePasswordRequest) returns (ChangePasswordResponse);
```

#### 请求 / 响应

```proto
message ChangePasswordRequest {
  int64 user_id = 1;
  string code = 2;
  string new_password = 3;
}

message ChangePasswordResponse {
  string message = 1;
}
```

#### 用途

- Gateway `POST /api/v1/profile/password/change`
- 通过 Redis 中的验证码完成改密
- 验证成功后立即删除验证码

### 3.9 ListAddresses

```proto
rpc ListAddresses(ListAddressesRequest) returns (ListAddressesResponse);
```

#### 请求 / 响应

```proto
message ListAddressesRequest {
  int64 user_id = 1;
}

message ListAddressesResponse {
  repeated Address addresses = 1;
}
```

#### 用途

- Gateway `GET /api/v1/addresses`
- 购物车结算页与个人中心地址页读取地址簿

### 3.10 GetAddress

```proto
rpc GetAddress(GetAddressRequest) returns (GetAddressResponse);
```

#### 请求 / 响应

```proto
message GetAddressRequest {
  int64 user_id = 1;
  int64 address_id = 2;
}

message GetAddressResponse {
  Address address = 1;
}
```

#### 用途

- Gateway `GET /api/v1/addresses/:id`

### 3.11 CreateAddress

```proto
rpc CreateAddress(CreateAddressRequest) returns (CreateAddressResponse);
```

#### 用途

- Gateway `POST /api/v1/addresses`
- 新建用户地址并支持直接设为默认地址

### 3.12 UpdateAddress

```proto
rpc UpdateAddress(UpdateAddressRequest) returns (UpdateAddressResponse);
```

#### 用途

- Gateway `PUT /api/v1/addresses/:id`
- 修改地址内容并支持直接切换默认地址

### 3.13 DeleteAddress

```proto
rpc DeleteAddress(DeleteAddressRequest) returns (DeleteAddressResponse);
```

#### 用途

- Gateway `DELETE /api/v1/addresses/:id`

### 3.14 SetDefaultAddress

```proto
rpc SetDefaultAddress(SetDefaultAddressRequest) returns (SetDefaultAddressResponse);
```

#### 用途

- Gateway `POST /api/v1/addresses/default`
- 将指定地址切换为当前用户默认地址

### 3.15 SendPasswordResetCodeByEmail

```proto
rpc SendPasswordResetCodeByEmail(SendPasswordResetCodeByEmailRequest) returns (SendPasswordResetCodeByEmailResponse);
```

#### 用途

- Gateway `POST /api/v1/auth/password/code`
- 登录页找回密码流程发送验证码

### 3.16 ResetPasswordByEmail

```proto
rpc ResetPasswordByEmail(ResetPasswordByEmailRequest) returns (ResetPasswordByEmailResponse);
```

#### 用途

- Gateway `POST /api/v1/auth/password/reset`
- 未登录状态下通过邮箱验证码重置密码

---

## 4. Admin Service gRPC

- **服务名**：`gobao.admin.v1.AdminService`
- **状态**：`已实现`
- **调用方**：
  - Gateway（后台登录 / 后台账号管理已接入）

当前 `AdminService` 与前台用户体系完全分离，专门承载后台账号能力。

### 4.1 Login

```proto
rpc Login(LoginRequest) returns (LoginResponse);
```

#### 请求 / 响应

```proto
message LoginRequest {
  string email = 1;
  string password = 2;
}

message LoginResponse {
  string access_token = 1;
  int64 expires_at = 2;
  int64 admin_id = 3;
}
```

#### 用途

- Gateway `POST /api/v1/admin/auth/login`
- 后台控制台登录入口

### 4.2 GetAdmin

```proto
rpc GetAdmin(GetAdminRequest) returns (GetAdminResponse);
```

#### 请求 / 响应

```proto
message GetAdminRequest {
  int64 admin_id = 1;
}

message GetAdminResponse {
  int64 admin_id = 1;
  string email = 2;
  string nickname = 3;
  string avatar_url = 4;
  bool is_super_admin = 5;
}
```

#### 用途

- Gateway `GET /api/v1/admin/auth/me`
- 后台控制台当前身份展示

### 4.3 ChangePassword

```proto
rpc ChangePassword(ChangePasswordRequest) returns (ChangePasswordResponse);
```

#### 请求 / 响应

```proto
message ChangePasswordRequest {
  int64 admin_id = 1;
  string current_password = 2;
  string new_password = 3;
}

message ChangePasswordResponse {
  string message = 1;
}
```

#### 用途

- Gateway `POST /api/v1/admin/auth/password/change`
- 允许任意后台账号使用旧密码校验后自行修改密码

#### 当前实现语义

- 当前密码错误可能返回 `UNAUTHENTICATED: invalid current password`
- 该错误表示旧密码业务校验失败，不表示后台 JWT 失效
- Gateway / 后台前端不得因为该错误清空后台登录态，应映射为“当前密码错误”
- 新密码与旧密码相同、密码长度不足等错误同样属于业务校验失败，应由前端转换为中文提示

### 4.4 ListAdmins

```proto
rpc ListAdmins(ListAdminsRequest) returns (ListAdminsResponse);
```

#### 请求 / 响应

```proto
message ListAdminsRequest {
  int64 requester_admin_id = 1;
}

message AdminSummary {
  int64 admin_id = 1;
  string email = 2;
  string nickname = 3;
  string avatar_url = 4;
  bool is_super_admin = 5;
}

message ListAdminsResponse {
  repeated AdminSummary items = 1;
}
```

#### 用途

- Gateway `GET /api/v1/admin/accounts`
- 仅超级管理员可查看全部后台账号

### 4.5 CreateAdmin

```proto
rpc CreateAdmin(CreateAdminRequest) returns (CreateAdminResponse);
```

#### 请求 / 响应

```proto
message CreateAdminRequest {
  int64 requester_admin_id = 1;
  string email = 2;
  string password = 3;
  string nickname = 4;
  string avatar_url = 5;
  bool is_super_admin = 6;
}

message CreateAdminResponse {
  AdminSummary admin = 1;
}
```

#### 用途

- Gateway `POST /api/v1/admin/accounts`
- 仅超级管理员可创建后台账号

### 4.6 UpdateAdminPassword

```proto
rpc UpdateAdminPassword(UpdateAdminPasswordRequest) returns (UpdateAdminPasswordResponse);
```

#### 请求 / 响应

```proto
message UpdateAdminPasswordRequest {
  int64 requester_admin_id = 1;
  int64 target_admin_id = 2;
  string new_password = 3;
}

message UpdateAdminPasswordResponse {
  string message = 1;
}
```

#### 用途

- Gateway `POST /api/v1/admin/accounts/:id/password`
- 仅超级管理员可重置其他后台账号密码

#### 当前实现补充

- 初始化 SQL 会自动创建超级管理员 `admin@admin / 12345`
- 初始超管昵称固定为 `admin`
- `is_super_admin = true` 的后台账号拥有后台账号管理权限

---

## 5. Product Service gRPC

- **服务名**：`gobao.product.v1.ProductService`
- **状态**：`主体已实现`
- **调用方**：
  - Gateway（商品/类目接口已接入）
  - Order（库存扣减 / 回补，后续接入）

在新的产品定位下，`ProductService` 默认服务于：

- 手机
- 笔记本与桌面电脑
- 平板
- 穿戴
- 音频
- 家居电子
- 官方配件

### 5.0 媒体后台能力补充

当前 `ProductService` 已具备最小媒体后台能力：

- 上传媒体资源
- 绑定商品组媒体
- 绑定独立商品媒体
- 更新商品组媒体绑定
- 更新独立商品媒体绑定
- 删除商品组媒体绑定
- 删除独立商品媒体绑定

并且当前 `GetProduct` 返回的媒体结构已经补充：

- `group_medias`
- `product_medias`
- `resolved_medias`

其中每个 `ProductMedia` 额外包含：

```proto
message ProductMedia {
  int64 id = 1;
  string image_url = 2;
  string alt_text = 3;
  int32 sort_order = 4;
  bool is_primary = 5;
  int64 binding_id = 6;
}
```

补充说明：

- `binding_id` 的加入主要服务后台管理页删除绑定
- 用户前台无需依赖该字段
- 该字段不会改变现有前台详情页展示语义

#### 当前网关映射关系

- `POST /api/v1/admin/media/upload`
- `POST /api/v1/admin/product-groups/:groupId/media`
- `POST /api/v1/admin/products/:id/media`
- `PUT /api/v1/admin/product-groups/:groupId/media/:bindingId`
- `PUT /api/v1/admin/products/:id/media/:bindingId`
- `DELETE /api/v1/admin/product-groups/:groupId/media/:bindingId`
- `DELETE /api/v1/admin/products/:id/media/:bindingId`

---

## 6. Order Service gRPC

- **服务名**：`gobao.order.v1.OrderService`
- **状态**：`创建订单 / 查单 / 订单列表 / 取消订单已实现`
- **调用方**：
  - Gateway（当前已接创建订单、订单详情、订单列表、取消订单）
  - 其他内部交易链路（后续可复用）

当前 `OrderService` 已经具备最小订单闭环中的创建与查询能力，并遵循以下语义：

- 下单核心标识为 `product_id`
- 价格、商品名称、规格摘要、图片快照全部以后端 Product 返回为准
- 前端展示层当前默认以商品名称为主信息，`option_summary` 仅作为次级版本说明
- 幂等键按 `user_id + request_id` 组合控制
- 当前库存扣减直接复用 Product 内部 `product_id + quantity` 库存 RPC
- 订单已预留收货地址快照字段
- 单笔查单必须校验 `order.user_id == user_id`
- 订单列表仅支持按当前用户分页倒序查询

### 5.1 CreateOrder

```proto
rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
```

#### 请求

```proto
message CreateOrderRequest {
  int64 user_id = 1;
  string request_id = 2;
  int64 product_id = 3;
  int32 quantity = 4;
  string receiver_name = 5;
  string receiver_phone = 6;
  string province = 7;
  string city = 8;
  string district = 9;
  string address_line = 10;
  string postal_code = 11;
}
```

#### 响应

```proto
message CreateOrderResponse {
  Order order = 1;
}
```

#### 关键返回结构

```proto
message Order {
  int64 id = 1;
  string order_no = 2;
  int64 user_id = 3;
  string request_id = 4;
  string status = 5;
  int64 total_amount = 6;
  int32 total_quantity = 7;
  string receiver_name = 8;
  string receiver_phone = 9;
  string province = 10;
  string city = 11;
  string district = 12;
  string address_line = 13;
  string postal_code = 14;
  int64 created_at = 15;
  int64 updated_at = 16;
  repeated OrderItem items = 17;
}

message OrderItem {
  int64 id = 1;
  int64 order_id = 2;
  int64 product_id = 3;
  string name = 4;
  string image_url = 5;
  string option_summary = 6;
  int64 price = 7;
  int32 quantity = 8;
  int64 amount = 9;
}
```

#### 用途

- 创建精品电子商品订单
- 为 Gateway 后续下单接口提供内部统一交易入口

#### 当前实现语义

- `request_id` 作为幂等键的一部分，按 `user_id + request_id` 去重
- `product_id` 是唯一的下单商品定位字段，价格、标题、规格摘要和商品图片全部以后端独立商品快照为准
- `option_summary` 在当前订单模型中仅承担版本/规格摘要展示职责，不再表示旧 SKU 主链路真值
- 创建订单时会写入地址快照，同时写入内部支付超时时间
- 当前 proto 暂未暴露 `expire_at`、`closed_at`、`close_reason`，这些字段仅在 Order 服务内部落库使用
- 当前库存协作仍通过 Product 内部库存 RPC 完成，调用参数仍是 `product_id + quantity`

### 5.2 GetOrder

```proto
rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
```

#### 请求

```proto
message GetOrderRequest {
  int64 user_id = 1;
  int64 order_id = 2;
}
```

#### 响应

```proto
message GetOrderResponse {
  Order order = 1;
}
```

#### 用途

- 查询当前用户的单笔订单详情
- 给 Gateway 后续订单详情页提供内部读取入口

#### 当前实现语义

- `user_id <= 0` 或 `order_id <= 0` 会返回 `INVALID_ARGUMENT`
- 订单不存在返回 `NOT_FOUND`
- 非订单所属用户访问返回 `PERMISSION_DENIED`
- 若订单状态为 `CREATED` 且已超过内部支付超时时间，读取前会先自动关闭订单
- 自动关闭会回补库存，并在数据库中写入 `close_reason=TIMEOUT` 与 `closed_at`
- 对外返回的订单状态仍为 `CANCELLED`

### 5.3 ListOrders

```proto
rpc ListOrders(ListOrdersRequest) returns (ListOrdersResponse);
```

#### 请求

```proto
message ListOrdersRequest {
  int64 user_id = 1;
  int32 page = 2;
  int32 page_size = 3;
}
```

#### 响应

```proto
message ListOrdersResponse {
  repeated Order items = 1;
  int64 total = 2;
}
```

#### 用途

- 分页查询当前用户订单列表
- 给 Gateway 后续订单列表页提供内部读取入口

#### 当前实现语义

- 仅按 `user_id` 过滤
- 按订单 `id DESC` 倒序返回
- `page <= 0` 时内部归一化为 `1`
- `page_size <= 0` 时内部归一化为 `20`
- `page_size > 100` 时内部归一化为 `100`
- 列表中的每一笔待支付订单在返回前都会检查是否已超时
- 已超时订单会在返回前自动关闭并回补库存，对外状态统一表现为 `CANCELLED`

### 5.4 CancelOrder

```proto
rpc CancelOrder(CancelOrderRequest) returns (CancelOrderResponse);
```

#### 请求

```proto
message CancelOrderRequest {
  int64 user_id = 1;
  int64 order_id = 2;
}
```

#### 响应

```proto
message CancelOrderResponse {
  Order order = 1;
}
```

#### 用途

- 取消当前用户尚未支付的订单
- 给 Gateway 和后续前端订单详情页提供主动取消入口

#### 当前实现语义

- 仅订单所属用户可取消
- 仅 `CREATED` 状态订单可取消
- 取消成功后会调用 Product 内部库存回补 RPC
- 当前通过仓储层状态 CAS 避免重复取消覆盖
- 用户主动取消会在内部写入 `close_reason=USER_CANCELLED` 和 `closed_at`

#### 当前实现边界

- 仅支持单独立商品下单
- 当前已支持支付成功推进为 `PAID`
- 当前支付失败与支付超时都会把订单收敛为 `CANCELLED`，内部再通过 `close_reason` 区分来源
- 地址字段为订单快照，尚未接独立地址簿系统
- 当前库存协作仍按 `product_id + quantity` 调 Product 内部库存接口

### 5.5 AdminListOrders / AdminGetOrder / AdminCancelOrder

```proto
rpc AdminListOrders(AdminListOrdersRequest) returns (ListOrdersResponse);
rpc AdminGetOrder(AdminGetOrderRequest) returns (GetOrderResponse);
rpc AdminCancelOrder(AdminCancelOrderRequest) returns (CancelOrderResponse);
```

#### 请求

```proto
message AdminListOrdersRequest {
  int32 page = 1;
  int32 page_size = 2;
  string status = 3;   // 为空表示不过滤状态
  int64 user_id = 4;   // 为 0 表示不过滤用户
}

message AdminGetOrderRequest { int64 order_id = 1; }
message AdminCancelOrderRequest { int64 order_id = 1; }
```

#### 用途

- 后台订单中心：跨用户查询全部订单、查任意订单详情、关闭任意未支付订单
- 经 Gateway `adminProtected`（`role=admin`）路由暴露为 `/api/v1/admin/orders*`

#### 当前实现语义

- 三者均**不校验订单归属**
- `AdminListOrders` 可按 `status` 与 `user_id` 叠加过滤；按邮箱筛选由 Gateway 先经 `FindUserByEmail` 解析为 `user_id`
- 如果邮箱未解析到用户，Gateway 直接返回空订单列表，不继续请求 Order Service
- 列表与详情同样会自动收敛已超时的待支付订单
- `AdminCancelOrder` 仅可关闭 `CREATED` 订单，回补库存并投递取消事件，`close_reason=ADMIN_CLOSED`

#### 运行依赖

- `ORDER_PRODUCT_GRPC_ADDR`：Product 服务 gRPC 地址，默认 `product:9090`
- `ORDER_REDIS_ADDR`：Redis 地址，默认 `redis:6379`
- `ORDER_REDIS_DB`：Redis DB，默认 `0`
- `ORDER_MYSQL_DSN`：Order 库连接串

### 4.1 商品接口

#### CreateProduct

```proto
rpc CreateProduct(CreateProductRequest) returns (CreateProductResponse);
```

用途：

- 创建精品电子商品并初始化库存
- 当前由 Gateway 后台写接口转发

当前补充语义：

- `group_id` 必填，必须指向已存在的 `product_group`
- 当前创建的是“商品组下的独立商品版本”，不是旧结构里的游离单商品
- `spec_label`、`spec_values_json`、`sort_order`、`status` 已纳入创建请求

#### GetProduct

```proto
rpc GetProduct(GetProductRequest) returns (GetProductResponse);
```

用途：

- 查询精品单品详情
- 返回库存数量与库存版本

当前补充语义：

- `stock_version` 主要供后台库存编辑场景使用
- 用户端前台一般无需消费该字段

#### ListProducts

```proto
rpc ListProducts(ListProductsRequest) returns (ListProductsResponse);
```

用途：

- 精品商品分页列表
- 支持按产品线 / 类目过滤

当前补充语义：

- `ListProducts` 返回值仍以独立商品版本为基础结构
- 同一产品系列会通过 `group_id` 关联
- 当前前端消费该接口时，会按 `group_id` 聚合成系列卡片后再展示给用户

#### UpdateProduct

```proto
rpc UpdateProduct(UpdateProductRequest) returns (UpdateProductResponse);
```

用途：

- 更新精品商品名称、价格、描述、类目、状态等

当前补充语义：

- 当前也支持更新 `group_id`、`spec_label`、`spec_values_json`、`sort_order`
- 如果更新后的 `group_id` 不存在，将返回前置条件失败

#### DeleteProduct

```proto
rpc DeleteProduct(DeleteProductRequest) returns (DeleteProductResponse);
```

用途：

- 软删除商品

---

### 4.2 商品组接口

#### CreateProductGroup

```proto
rpc CreateProductGroup(CreateProductGroupRequest) returns (CreateProductGroupResponse);
```

用途：

- 创建一个前台系列页对应的商品组
- 维护名称、slug、Hero 文案、Hero 图、封面图、排序与所属类目
- `CreateProductGroupRequest` / `UpdateProductGroupRequest` / `ProductGroup` 均含 `repeated string spec_keys`，表示该商品组定义的规格维度名称

#### ListProductGroups

```proto
rpc ListProductGroups(ListProductGroupsRequest) returns (ListProductGroupsResponse);
```

用途：

- 分页查询商品组列表
- 当前后台商品页直接使用它驱动商品组选择器

#### UpdateProductGroup

```proto
rpc UpdateProductGroup(UpdateProductGroupRequest) returns (UpdateProductGroupResponse);
```

用途：

- 更新商品组展示元信息
- 不直接影响交易真值、价格与库存

#### DeleteProductGroup

```proto
rpc DeleteProductGroup(DeleteProductGroupRequest) returns (DeleteProductGroupResponse);
```

用途：

- 删除商品组
- 若组下仍有关联独立商品，后端会返回前置条件失败

当前补充语义：

- 商品组负责页面聚合与展示真值
- 独立商品负责交易真值
- 后台新建独立商品版本前，应优先准备好商品组
- `spec_keys` 由商品组定义规格维度（如 `["芯片","内存","存储"]`），子商品只能在这些维度上填值；以 JSON 数组持久化于 `product_groups.spec_keys_json` 列

---

### 4.3 类目接口

#### CreateCategory

```proto
rpc CreateCategory(CreateCategoryRequest) returns (CreateCategoryResponse);
```

#### ListCategories

```proto
rpc ListCategories(ListCategoriesRequest) returns (ListCategoriesResponse);
```

#### UpdateCategory

```proto
rpc UpdateCategory(UpdateCategoryRequest) returns (UpdateCategoryResponse);
```

#### DeleteCategory

```proto
rpc DeleteCategory(DeleteCategoryRequest) returns (DeleteCategoryResponse);
```

#### 用途

- Gateway 精品商品后台管理
- 商品创建 / 更新时依赖产品线类目有效性

---

### 4.4 库存接口

#### UpdateStock

```proto
rpc UpdateStock(UpdateStockRequest) returns (UpdateStockResponse);
```

- **状态**：`已实现`
- **当前对前端 / Gateway**：已通过后台 Gateway 写接口开放
- **用途**：
  - 商家后台直接修改库存
  - 依赖 `expected_version` 做 CAS 并发保护

当前 Gateway 写口：

- `PUT /api/v1/admin/products/:id/stock`

#### DeductStock

```proto
rpc DeductStock(DeductStockRequest) returns (DeductStockResponse);
```

- **状态**：`已实现`
- **当前调用方**：Order 已接入
- **用途**：
  - 普通下单扣减库存
  - 未来秒杀落单二次兜底

#### RestoreStock

```proto
rpc RestoreStock(RestoreStockRequest) returns (RestoreStockResponse);
```

- **状态**：`已实现`
- **当前调用方**：Order 已接入
- **用途**：
  - 取消订单回补库存
  - 支付失败或补偿场景回补库存

---

### 4.5 秒杀活动接口

#### GetSeckillActivity

```proto
rpc GetSeckillActivity(GetSeckillActivityRequest) returns (GetSeckillActivityResponse);
```

- **状态**：`已实现`
- **当前调用方**：
  - Gateway 秒杀活动详情接口
  - 其他后续需要读取活动真值的内部服务
- **用途**：
  - 查询精品发售活动基础信息
  - 返回活动价格、活动库存、状态和时间窗

#### PrewarmSeckill

```proto
rpc PrewarmSeckill(PrewarmSeckillRequest) returns (PrewarmSeckillResponse);
```

- **状态**：`已实现`
- **当前调用方**：
  - Gateway 秒杀预热接口
  - 冒烟脚本与联调工具
- **用途**：
  - 把活动元信息写入 `seckill:activity:{id}:meta`
  - 把活动库存写入 `seckill:activity:{id}:stock`
  - 为 Gateway 抢购入口的 Lua 原子预扣提供缓存前置数据

#### 当前说明

- Product 持有秒杀活动真值，MySQL 中使用 `seckill_activities` 表持久化
- 预热写 Redis 时：
  - 活动元信息以 JSON 形式写入 `meta key`
  - 库存以数值形式写入 `stock key`
- 当前尚未提供秒杀活动后台 CRUD gRPC，仅实现查询与预热

在新定位下，这里的“秒杀活动”更建议理解为：

- 新品发售活动
- 限量精选活动
- 小规模高关注度精品电子商品抢购

---

## 6. Order Service 后续接口规划

- **服务名**：`OrderService`
- **状态**：`部分已实现，以下内容仍规划中`
- **说明**：
  - `CreateOrder` 已在上文 `gobao.order.v1.OrderService` 中落地
  - 本节只保留尚未实现的后续能力规划，避免和已实现部分混淆

### 6.1 规划中的核心 RPC

- `GetSeckillResult`

### 6.2 预期调用关系

- Gateway → Order：精品商品普通下单、查单、取消订单、活动结果查询
- Order → Product：`DeductStock` / `RestoreStock`
- Order → NATS：发布订单事件

### 6.3 预期事件

- `order.created`
- `order.paid`
- `order.cancelled`

### 6.4 当前说明

当前 Order 普通单主路径已经进入可联调状态，已落地：

- `CreateOrder`
- `GetOrder`
- `ListOrders`
- `CancelOrder`
- `order.created`
- `order.cancelled`
- `payment.paid -> PAID`
- `payment.failed -> PAYMENT_FAILED`

当前仍未完成的主要是：

- 秒杀订单消费与结果查询
- 更复杂的订单状态机与自动关单补偿

---

## 7. Payment Service 内部接口

- **服务名**：`gobao.payment.v1.PaymentService`
- **状态**：`已实现最小闭环`
- **主要依据**：`payment.proto`、Payment service、Gateway payment handler

### 7.1 GetPayment

```proto
rpc GetPayment(GetPaymentRequest) returns (GetPaymentResponse);
```

#### 请求 / 响应

```proto
message GetPaymentRequest {
  int64 user_id = 1;
  int64 payment_id = 2;
}

message GetPaymentResponse {
  Payment payment = 1;
}
```

#### 用途

- Gateway `GET /api/v1/payments/:id`
- 当前用户按支付单 ID 查询自己的支付状态

#### 当前实现语义

- `Payment.status` 当前支持 `PENDING`、`SUCCEEDED`、`FAILED`、`CANCELLED`
- `CANCELLED` 表示支付单因订单关闭而失效，不再允许继续支付

### 7.2 GetPaymentByOrder

```proto
rpc GetPaymentByOrder(GetPaymentByOrderRequest) returns (GetPaymentByOrderResponse);
```

#### 请求 / 响应

```proto
message GetPaymentByOrderRequest {
  int64 user_id = 1;
  int64 order_id = 2;
}

message GetPaymentByOrderResponse {
  Payment payment = 1;
}
```

#### 用途

- Gateway `GET /api/v1/payments/by-order/:orderId`
- 当前用户按订单查询支付状态

#### 当前实现语义

- 若订单关闭事件已到达 Payment 服务，对应的待支付支付单会先被收敛为 `CANCELLED`
- 已支付或已失败支付单不会因为订单取消事件被逆向覆盖

### 7.3 MockConfirmPayment

```proto
rpc MockConfirmPayment(MockConfirmPaymentRequest) returns (MockConfirmPaymentResponse);
```

#### 请求 / 响应

```proto
message MockConfirmPaymentRequest {
  int64 user_id = 1;
  int64 payment_id = 2;
  string result = 3;
}

message MockConfirmPaymentResponse {
  Payment payment = 1;
}
```

#### 业务约束

- `result` 当前仅支持 `SUCCESS` / `FAILED`
- 只有支付单归属用户才能确认
- 只有 `PENDING` 状态的支付单允许确认
- 若支付单已因订单关闭事件收敛为 `CANCELLED`，再次确认会返回 `FAILED_PRECONDITION`

#### 用途

- Gateway `POST /api/v1/payments/:id/mock-confirm`
- 后端联调、管理态演示、订单与支付状态验证

### 7.4 当前调用关系

- Payment 消费 `order.created`
- Payment 自动创建 `PENDING` 支付单
- Gateway 调用 Payment 查询支付单
- Gateway 调用 Payment 处理模拟支付确认
- Payment 发布支付结果事件给 Order

### 7.5 当前事件

- `payment.paid`
- `payment.failed`

### 7.6 当前说明

Payment 当前已落地的最小能力：

- `order.created` 自动建支付单
- 支付单按 `payment_id` 查询
- 支付单按 `order_id` 查询
- mock 支付成功 / 失败
- 支付结果事件发布

当前仍未完成：

- 真实收银台 / 第三方支付渠道接入
- 更完整的支付日志与对账能力

---

## 7. 秒杀相关内部接口

- **当前总体状态**：`部分已实现`

当前已经落地：

- Product 秒杀活动 gRPC 查询 / 预热
- Gateway 秒杀活动查询、预热、抢购入口
- Redis 幂等去重
- Redis Lua 原子预扣
- NATS JetStream `seckill.order` 真实投递

当前仍未落地：

- Order 消费 `seckill.order`
- 秒杀订单落库
- 秒杀结果查询
- 限流与更完整的防刷策略

### 7.1 Gateway 侧

- **状态**：`已实现基础版`
- **公开 HTTP 路径**：
  - `GET /api/v1/seckill/activities/:id`
  - `POST /api/v1/seckill/activities/:id/prewarm`
  - `POST /api/v1/seckill/activities/:id/purchase`

#### 当前行为

- 查询活动：转发到 Product `GetSeckillActivity`
- 预热活动：转发到 Product `PrewarmSeckill`
- 抢购入口：
  - 校验活动时间窗
  - 基于 Redis `SETNX` 做请求幂等
  - 基于 Redis Lua 对 `stock key` 做原子预扣
  - 成功后向 `seckill.order` 投递消息
  - 如果发布失败，会回补 Redis 活动库存

在新的产品语义下，这条链路默认用于：

- 新品发售抢购
- 限量精选活动下单排队
- 少量高价值电子商品的高并发活动入口

#### 当前边界

- 仍未接入专门的限流器
- 仍未提供抢购结果查询
- 当前 `quantity` 仅支持 `1`

### 7.2 Order 侧

- **状态**：`规划中 / 未实现`
- 后续需要补齐：
  - 消费 `seckill.order`
  - 限速 worker 落单
  - 写入秒杀结果缓存
  - 提供秒杀结果查询接口

---

## 8. 当前内部事件总览

### 8.1 已进入设计，部分已落地的事件

- `seckill.order`
- `order.created`
- `order.paid`
- `order.cancelled`
- `payment.paid`
- `payment.failed`
- `stock.restore`

### 8.2 当前状态说明

这些事件在系统设计中已明确，但截至当前代码状态：

- `seckill.order` 已由 Gateway 真实发布到 NATS JetStream
- `seckill.order` 当前已由 Order mock 消费，并发布占位 `order.created`
- `order.created` 已由普通下单链路真实发布
- `order.cancelled` 已由取消订单链路真实发布
- Payment 已真实消费 `order.created` 并自动创建 `PENDING` 支付单
- Payment 已真实发布 `payment.paid` / `payment.failed`
- Order 已真实消费支付结果事件，并把订单推进到 `PAID` / `PAYMENT_FAILED`
- NATS 基础设施已在 Compose 中可用
- 后续 I3 / I4 / I5 会逐步把这些事件接进真实业务流程

### 8.3 `seckill.order` 当前消息体

当前 Gateway 投递的基础消息字段为：

```json
{
  "request_id": "frontend-unique-request-id",
  "user_id": 10001,
  "activity_id": 3,
  "product_id": 3,
  "quantity": 1,
  "queued_at": 1777514300
}
```

字段说明：

- `request_id`：幂等请求 ID
- `user_id`：发起抢购的用户 ID
- `activity_id`：秒杀活动 ID
- `product_id`：关联商品 ID
- `quantity`：当前固定为 `1`
- `queued_at`：进入队列的 Unix 秒时间戳

---

## 9. 建议用法

### 面向前端

- 只依赖 `docs/api/frontend-api.md`
- 不直接依赖任何内部 gRPC 或事件约定

### 面向后端

- 当前可直接依赖：
  - User proto
  - Product proto（含秒杀活动查询 / 预热）
  - Gateway 秒杀 HTTP 入口
  - `seckill.order` 当前消息体
- 规划阶段参考：Order / Payment / 后续秒杀结果查询约定
- 在 I3 / I4 / I5 真正实现前，不应把未落地的 Order / Payment / 秒杀结果接口当成稳定事实
