import { ApiError, apiRequest } from './client';
import { normalizeOptionalPayment, normalizePayment } from '../lib/paymentModel';
import type { Payment } from '../lib/types';

/**
 * 按支付单 ID 读取当前登录用户的支付详情。
 */
export async function fetchPayment(paymentId: number): Promise<Payment> {
  const raw = await apiRequest<any>(`/api/v1/payments/${paymentId}`, undefined, { auth: true });
  return normalizePayment(raw.payment);
}

/**
 * 按订单 ID 读取对应支付单。
 * 若支付单尚未创建完成或暂时不可见，则统一返回 null，交由页面展示等待状态。
 */
export async function fetchPaymentByOrder(orderId: number): Promise<Payment | null> {
  try {
    const raw = await apiRequest<any>(`/api/v1/payments/by-order/${orderId}`, undefined, { auth: true });
    return normalizeOptionalPayment(raw.payment);
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 404) {
      return null;
    }
    throw cause;
  }
}

/**
 * 触发当前支付单的 mock 支付确认。
 * result 仅支持 SUCCESS / FAILED，支付结果和订单状态以后端联动回写为准。
 */
export async function mockConfirmPayment(paymentId: number, result: 'SUCCESS' | 'FAILED'): Promise<Payment> {
  const raw = await apiRequest<any>(
    `/api/v1/payments/${paymentId}/mock-confirm`,
    {
      method: 'POST',
      body: JSON.stringify({ result }),
    },
    { auth: true },
  );
  return normalizePayment(raw.payment);
}
