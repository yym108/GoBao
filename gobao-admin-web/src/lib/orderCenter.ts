import type { Order } from './types';

/**
 * 将后端订单状态统一映射为用户态中文文案。
 * 前端只展示后端状态，不自行推导额外交易规则。
 */
export function resolveOrderStatusLabel(status: string): string {
  switch (status) {
    case 'CREATED':
      return '待支付';
    case 'PAID':
      return '已支付';
    case 'CANCELLED':
      return '已取消';
    default:
      return status || '未知状态';
  }
}

/**
 * 将后端支付状态统一映射为用户态中文文案。
 */
export function resolvePaymentStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return '待支付';
    case 'CANCELLED':
      return '已失效';
    case 'SUCCEEDED':
      return '支付成功';
    case 'FAILED':
      return '支付失败';
    default:
      return status || '未知状态';
  }
}

/**
 * 仅待支付订单允许取消，其他状态都视为已进入后续流程或终态。
 */
export function canCancelOrder(status: string): boolean {
  return status === 'CREATED';
}

/**
 * 只有待支付订单上的待支付支付单允许进行 mock 成功/失败确认。
 */
export function canMockConfirmPayment(orderStatus: string, paymentStatus: string): boolean {
  return orderStatus === 'CREATED' && paymentStatus === 'PENDING';
}

/**
 * 为支付状态补充一条更贴近用户理解的说明文案。
 * 这里不做业务推导，只按后端最终状态给出展示性解释。
 */
export function resolvePaymentStatusHint(status: string): string {
  switch (status) {
    case 'PENDING':
      return '当前支付单尚未完成确认。';
    case 'CANCELLED':
      return '当前支付单已随订单关闭而失效，无法继续支付。';
    case 'SUCCEEDED':
      return '当前支付单已经完成支付。';
    case 'FAILED':
      return '当前支付单已确认失败，如需购买请重新下单。';
    default:
      return '当前支付状态以后端返回为准。';
  }
}

/**
 * 从订单明细中提取用户更容易理解的商品摘要。
 */
export function resolveOrderSummary(order: Order): string {
  if (!order.items.length) {
    return '当前订单商品摘要暂不可用';
  }

  const [firstItem] = order.items;
  if (order.items.length === 1) {
    return firstItem.name || '商品信息待同步';
  }
  return `${firstItem.name} 等 ${order.items.length} 件商品`;
}

/**
 * 将订单快照中的收货地址组合为一行展示文案。
 */
export function resolveOrderAddress(order: Order): string {
  return [order.province, order.city, order.district, order.address_line].filter(Boolean).join(' ');
}
