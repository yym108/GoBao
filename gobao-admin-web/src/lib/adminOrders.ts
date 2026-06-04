import type { Order } from './types';

/** 订单状态筛选下拉项，value 为空哨兵 'all' 表示不过滤。 */
export const ORDER_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'CREATED', label: '待支付' },
  { value: 'PAID', label: '已支付' },
  { value: 'CANCELLED', label: '已取消' },
];

/** 当前页订单的状态概览统计。 */
export interface OrderOverview {
  created: number;
  paid: number;
  cancelled: number;
}

/**
 * 统计当前页订单各状态数量。
 * 跨页总量以接口返回的 total 为准，这里只对当前已加载页做状态分布概览。
 */
export function buildOrderOverview(orders: Order[]): OrderOverview {
  return {
    created: orders.filter((order) => order.status === 'CREATED').length,
    paid: orders.filter((order) => order.status === 'PAID').length,
    cancelled: orders.filter((order) => order.status === 'CANCELLED').length,
  };
}
