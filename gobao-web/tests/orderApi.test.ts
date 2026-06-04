import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreateOrderPayload } from '../src/api/orders.ts';

test('normalizeCreateOrderPayload 保留订单接口需要的最小字段', () => {
  const payload = normalizeCreateOrderPayload({
    request_id: 'req-1',
    product_id: 101,
    quantity: 2,
    address_id: 9,
  });

  assert.deepEqual(payload, {
    request_id: 'req-1',
    product_id: 101,
    quantity: 2,
    address_id: 9,
  });
});
