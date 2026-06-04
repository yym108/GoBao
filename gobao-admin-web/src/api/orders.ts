import { apiRequest } from './client.ts';
import type { CreateOrderPayload, Order, OrderItem, OrderListResponse } from '../lib/types';

/**
 * 将网关订单明细响应统一归一化为前端内部结构，
 * 同时兼容 snake_case 与 camelCase 字段，避免后端序列化细节直接渗透到页面层。
 */
function normalizeOrderItem(raw: any): OrderItem {
  return {
    id: raw.id ?? 0,
    order_id: raw.order_id ?? raw.orderId ?? 0,
    product_id: raw.product_id ?? raw.productId ?? 0,
    name: raw.name ?? '',
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    option_summary: raw.option_summary ?? raw.optionSummary ?? '',
    price: raw.price ?? 0,
    quantity: raw.quantity ?? 0,
    amount: raw.amount ?? 0,
  };
}

/**
 * 将单笔订单归一化为前端统一使用的订单模型，
 * 订单金额、状态与商品摘要全部以后端返回为准，前端只做展示。
 */
function normalizeOrder(raw: any): Order {
  return {
    id: raw.id ?? 0,
    order_no: raw.order_no ?? raw.orderNo ?? '',
    user_id: raw.user_id ?? raw.userId ?? 0,
    request_id: raw.request_id ?? raw.requestId ?? '',
    status: raw.status ?? '',
    total_amount: raw.total_amount ?? raw.totalAmount ?? 0,
    total_quantity: raw.total_quantity ?? raw.totalQuantity ?? 0,
    receiver_name: raw.receiver_name ?? raw.receiverName ?? '',
    receiver_phone: raw.receiver_phone ?? raw.receiverPhone ?? '',
    province: raw.province ?? '',
    city: raw.city ?? '',
    district: raw.district ?? '',
    address_line: raw.address_line ?? raw.addressLine ?? '',
    postal_code: raw.postal_code ?? raw.postalCode ?? '',
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
    items: (raw.items ?? []).map((item: any) => normalizeOrderItem(item)),
  };
}

/**
 * 读取当前登录用户的订单列表。
 * 当前先按固定分页读取第一页，为个人中心订单页提供最小真实数据展示。
 */
export async function fetchOrders(page = 1, pageSize = 20): Promise<OrderListResponse> {
  const query = new URLSearchParams();
  query.set('page', String(page));
  query.set('page_size', String(pageSize));

  const raw = await apiRequest<any>(`/api/v1/orders?${query.toString()}`, undefined, { adminAuth: true });
  return {
    items: (raw.items ?? []).map((item: any) => normalizeOrder(item)),
    total: raw.total ?? 0,
  };
}

/**
 * 将下单请求收敛为订单接口当前真正需要的最小字段，避免页面层夹带无关展示信息。
 */
export function normalizeCreateOrderPayload(payload: CreateOrderPayload): CreateOrderPayload {
  return {
    request_id: payload.request_id,
    product_id: payload.product_id,
    quantity: payload.quantity,
    address_id: payload.address_id,
  };
}

/**
 * 创建单笔订单。
 * 当前一次请求只创建一笔订单，购物车批量结算由页面层顺序调度。
 */
export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const raw = await apiRequest<any>(
    '/api/v1/orders',
    {
      method: 'POST',
      body: JSON.stringify(normalizeCreateOrderPayload(payload)),
    },
    { adminAuth: true },
  );
  return normalizeOrder(raw.order);
}

/**
 * 按订单 ID 读取当前登录用户的单笔订单详情。
 * 当前订单页在执行取消或模拟支付后，会重新读取该接口以同步后端真实状态。
 */
export async function fetchOrder(orderId: number): Promise<Order> {
  const raw = await apiRequest<any>(`/api/v1/orders/${orderId}`, undefined, { adminAuth: true });
  return normalizeOrder(raw.order);
}

export interface AdminOrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  email?: string;
}

/**
 * 管理员分页查询全部订单（可选按状态、买家邮箱过滤）。
 * 走后台专用聚合接口，不限定下单用户，需后台 JWT。
 */
export async function fetchAdminOrders(params: AdminOrderListParams = {}): Promise<OrderListResponse> {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.pageSize ?? 20));
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.email) {
    query.set('email', params.email);
  }

  const raw = await apiRequest<any>(`/api/v1/admin/orders?${query.toString()}`, undefined, { adminAuth: true });
  return {
    items: (raw.items ?? []).map((item: any) => normalizeOrder(item)),
    total: raw.total ?? 0,
  };
}

/**
 * 管理员按订单 ID 查询任意订单详情，不校验归属。
 */
export async function fetchAdminOrder(orderId: number): Promise<Order> {
  const raw = await apiRequest<any>(`/api/v1/admin/orders/${orderId}`, undefined, { adminAuth: true });
  return normalizeOrder(raw.order);
}

/**
 * 管理员关闭任意未支付订单。
 * 是否允许关闭以后端订单状态机为准，前端不做额外推导。
 */
export async function cancelAdminOrder(orderId: number): Promise<Order> {
  const raw = await apiRequest<any>(`/api/v1/admin/orders/${orderId}/cancel`, { method: 'POST' }, { adminAuth: true });
  return normalizeOrder(raw.order);
}

/**
 * 取消当前登录用户的待支付订单。
 * 是否允许取消以后端订单状态机为准，前端不做额外推导。
 */
export async function cancelOrder(orderId: number): Promise<Order> {
  const raw = await apiRequest<any>(
    `/api/v1/orders/${orderId}/cancel`,
    {
      method: 'POST',
    },
    { adminAuth: true },
  );
  return normalizeOrder(raw.order);
}
