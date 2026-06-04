import { describe, expect, it } from 'vitest';
import { ORDER_STATUS_FILTERS, buildOrderOverview } from './adminOrders';
import type { Order } from './types';

/** 构造一个最小订单测试数据，只覆盖统计关心的字段。 */
function makeOrder(status: string): Order {
  return {
    id: 1,
    order_no: 'ORD-1',
    user_id: 1,
    request_id: '',
    status,
    total_amount: 0,
    total_quantity: 0,
    receiver_name: '',
    receiver_phone: '',
    province: '',
    city: '',
    district: '',
    address_line: '',
    postal_code: '',
    created_at: 0,
    updated_at: 0,
    items: [],
  };
}

describe('ORDER_STATUS_FILTERS', () => {
  it('首项为全部，并覆盖三种订单状态', () => {
    expect(ORDER_STATUS_FILTERS[0]).toEqual({ value: 'all', label: '全部' });
    const values = ORDER_STATUS_FILTERS.map((item) => item.value);
    expect(values).toContain('CREATED');
    expect(values).toContain('PAID');
    expect(values).toContain('CANCELLED');
  });
});

describe('buildOrderOverview', () => {
  it('按状态分别统计当前页订单数量', () => {
    const overview = buildOrderOverview([
      makeOrder('CREATED'),
      makeOrder('CREATED'),
      makeOrder('PAID'),
      makeOrder('CANCELLED'),
    ]);
    expect(overview).toEqual({ created: 2, paid: 1, cancelled: 1 });
  });

  it('空列表全部为 0', () => {
    expect(buildOrderOverview([])).toEqual({ created: 0, paid: 0, cancelled: 0 });
  });
});
