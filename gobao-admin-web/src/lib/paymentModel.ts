import type { Payment } from './types';

/**
 * 将网关返回的支付单结构归一化为前端内部统一模型，
 * 同时兼容 snake_case 与 camelCase 字段，避免页面层直接感知后端序列化差异。
 */
export function normalizePayment(raw: any): Payment {
  return {
    id: raw.id ?? 0,
    payment_no: raw.payment_no ?? raw.paymentNo ?? '',
    order_id: raw.order_id ?? raw.orderId ?? 0,
    order_no: raw.order_no ?? raw.orderNo ?? '',
    user_id: raw.user_id ?? raw.userId ?? 0,
    amount: raw.amount ?? 0,
    status: raw.status ?? '',
    channel: raw.channel ?? '',
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
    paid_at: raw.paid_at ?? raw.paidAt ?? 0,
  };
}

/**
 * 部分支付接口在读取不到对应支付单时会直接返回空值，
 * 这里统一收口为 null，方便页面层明确区分“无支付单”和“未加载”。
 */
export function normalizeOptionalPayment(raw: any): Payment | null {
  if (!raw) {
    return null;
  }
  return normalizePayment(raw);
}
