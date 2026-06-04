import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCancelOrder,
  canMockConfirmPayment,
  resolveOrderStatusLabel,
  resolvePaymentStatusHint,
  resolveOrderSummary,
  resolvePaymentStatusLabel,
} from '../src/lib/orderCenter.ts';

test('订单状态会转换为统一中文文案', () => {
  assert.equal(resolveOrderStatusLabel('CREATED'), '待支付');
  assert.equal(resolveOrderStatusLabel('PAID'), '已支付');
  assert.equal(resolveOrderStatusLabel('CANCELLED'), '已取消');
});

test('支付状态会转换为统一中文文案', () => {
  assert.equal(resolvePaymentStatusLabel('PENDING'), '待支付');
  assert.equal(resolvePaymentStatusLabel('CANCELLED'), '已失效');
  assert.equal(resolvePaymentStatusLabel('SUCCEEDED'), '支付成功');
  assert.equal(resolvePaymentStatusLabel('FAILED'), '支付失败');
});

test('支付状态提示文案会按后端状态展示', () => {
  assert.equal(resolvePaymentStatusHint('PENDING'), '当前支付单尚未完成确认。');
  assert.equal(resolvePaymentStatusHint('CANCELLED'), '当前支付单已随订单关闭而失效，无法继续支付。');
  assert.equal(resolvePaymentStatusHint('SUCCEEDED'), '当前支付单已经完成支付。');
  assert.equal(resolvePaymentStatusHint('FAILED'), '当前支付单已确认失败，如需购买请重新下单。');
});

test('只有待支付订单允许取消', () => {
  assert.equal(canCancelOrder('CREATED'), true);
  assert.equal(canCancelOrder('PAID'), false);
  assert.equal(canCancelOrder('CANCELLED'), false);
});

test('只有待支付订单上的待支付支付单允许模拟确认', () => {
  assert.equal(canMockConfirmPayment('CREATED', 'PENDING'), true);
  assert.equal(canMockConfirmPayment('CREATED', 'SUCCEEDED'), false);
  assert.equal(canMockConfirmPayment('CANCELLED', 'PENDING'), false);
  assert.equal(canMockConfirmPayment('PAID', 'PENDING'), false);
});

test('订单摘要会优先突出商品名，多件商品保持简洁概览', () => {
  assert.equal(
    resolveOrderSummary({
      id: 1,
      order_no: 'ORD-1',
      user_id: 1,
      request_id: 'req-1',
      status: 'CREATED',
      total_amount: 100,
      total_quantity: 1,
      receiver_name: '',
      receiver_phone: '',
      province: '',
      city: '',
      district: '',
      address_line: '',
      postal_code: '',
      created_at: 1,
      updated_at: 1,
      items: [
        {
          id: 11,
          order_id: 1,
          product_id: 101,
          name: 'MacBook Air',
          image_url: '',
          option_summary: 'M4 / 16GB / 512GB',
          price: 100,
          quantity: 1,
          amount: 100,
        },
      ],
    }),
    'MacBook Air',
  );

  assert.equal(
    resolveOrderSummary({
      id: 2,
      order_no: 'ORD-2',
      user_id: 1,
      request_id: 'req-2',
      status: 'CREATED',
      total_amount: 200,
      total_quantity: 2,
      receiver_name: '',
      receiver_phone: '',
      province: '',
      city: '',
      district: '',
      address_line: '',
      postal_code: '',
      created_at: 1,
      updated_at: 1,
      items: [
        {
          id: 21,
          order_id: 2,
          product_id: 201,
          name: 'iPhone',
          image_url: '',
          option_summary: '',
          price: 100,
          quantity: 1,
          amount: 100,
        },
        {
          id: 22,
          order_id: 2,
          product_id: 202,
          name: 'AirPods',
          image_url: '',
          option_summary: '',
          price: 100,
          quantity: 1,
          amount: 100,
        },
      ],
    }),
    'iPhone 等 2 件商品',
  );
});
