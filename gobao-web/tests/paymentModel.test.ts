import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOptionalPayment, normalizePayment } from '../src/lib/paymentModel.ts';

test('normalizePayment 会兼容 snake_case 与 camelCase 字段', () => {
  const normalized = normalizePayment({
    id: 301,
    paymentNo: 'PAY-301',
    order_id: 101,
    orderNo: 'ORD-101',
    user_id: 1001,
    amount: 999900,
    status: 'PENDING',
    channel: 'MOCK',
    created_at: 1779681600,
    updatedAt: 1779681601,
    paid_at: 0,
  });

  assert.deepEqual(normalized, {
    id: 301,
    payment_no: 'PAY-301',
    order_id: 101,
    order_no: 'ORD-101',
    user_id: 1001,
    amount: 999900,
    status: 'PENDING',
    channel: 'MOCK',
    created_at: 1779681600,
    updated_at: 1779681601,
    paid_at: 0,
  });
});

test('normalizeOptionalPayment 会在空值场景返回 null', () => {
  assert.equal(normalizeOptionalPayment(null), null);
  assert.equal(normalizeOptionalPayment(undefined), null);
});
