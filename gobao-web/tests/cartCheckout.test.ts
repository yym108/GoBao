import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutPayload,
  executeCartBatchCheckout,
  resolveCheckoutSummaryNotice,
  createAddressDraft,
  validateAddressDraft,
} from '../src/lib/cartCheckout.ts';

test('validateAddressDraft 会拦截缺失字段', () => {
  const draft = createAddressDraft();
  const result = validateAddressDraft(draft);

  assert.equal(result.receiver_name, '请填写收货人');
  assert.equal(result.receiver_phone, '请填写联系电话');
  assert.equal(result.province, '请填写省份');
  assert.equal(result.city, '请填写城市');
  assert.equal(result.district, '请填写区县');
  assert.equal(result.address_line, '请填写详细地址');
});

test('validateAddressDraft 在字段齐全时不返回错误', () => {
  const result = validateAddressDraft({
    receiver_name: '张三',
    receiver_phone: '13800138000',
    province: '上海市',
    city: '上海市',
    district: '浦东新区',
    address_line: '世纪大道 1 号',
    postal_code: '',
    is_default: false,
  });

  assert.deepEqual(result, {
    receiver_name: '',
    receiver_phone: '',
    province: '',
    city: '',
    district: '',
    address_line: '',
    postal_code: '',
  });
});

test('buildCheckoutPayload 会基于购物车条目生成单条下单请求', () => {
  const payload = buildCheckoutPayload(
    {
      id: 8,
      user_id: 1001,
      receiver_name: '张三',
      receiver_phone: '13800138000',
      province: '上海市',
      city: '上海市',
      district: '浦东新区',
      address_line: '世纪大道 1 号',
      postal_code: '200120',
      is_default: true,
    },
    {
      cart_item_id: 'cart-1',
      product_id: 1,
      name: 'MacBook Air',
      price: 999900,
      quantity: 1,
      image_url: '',
      option_summary: 'M4 / 16GB / 512GB',
    },
  );

  assert.equal(payload.product_id, 1);
  assert.equal(payload.quantity, 1);
  assert.equal(payload.address_id, 8);
  assert.equal(typeof payload.request_id, 'string');
  assert.ok(payload.request_id.length > 0);
});

test('resolveCheckoutSummaryNotice 会区分全成功、部分成功和全失败', () => {
  assert.equal(resolveCheckoutSummaryNotice(2, 2), '本次已生成 2 笔订单。');
  assert.equal(resolveCheckoutSummaryNotice(1, 3), '已成功生成 1 笔订单，剩余商品未提交。');
  assert.equal(resolveCheckoutSummaryNotice(0, 3), '订单提交失败，请检查收货信息或商品状态后重试。');
});

test('executeCartBatchCheckout 会在成功后删除条目，并在失败时停止后续提交', async () => {
  const calledCreateOrderProductIds: number[] = [];
  const calledDeleteItemIds: string[] = [];

  const result = await executeCartBatchCheckout({
    address: {
      id: 8,
      user_id: 1001,
      receiver_name: '张三',
      receiver_phone: '13800138000',
      province: '上海市',
      city: '上海市',
      district: '浦东新区',
      address_line: '世纪大道 1 号',
      postal_code: '',
      is_default: true,
    },
    items: [
      {
        cart_item_id: 'cart-1',
        product_id: 1,
        name: 'MacBook Air',
        price: 999900,
        quantity: 1,
        image_url: '',
        option_summary: '',
      },
      {
        cart_item_id: 'cart-2',
        product_id: 2,
        name: 'iPhone',
        price: 599900,
        quantity: 1,
        image_url: '',
        option_summary: '',
      },
      {
        cart_item_id: 'cart-3',
        product_id: 3,
        name: 'AirPods',
        price: 199900,
        quantity: 1,
        image_url: '',
        option_summary: '',
      },
    ],
    createOrder: async (payload) => {
      calledCreateOrderProductIds.push(payload.product_id);
      if (payload.product_id === 2) {
        throw new Error('boom');
      }
    },
    deleteCartItem: async (cartItemId) => {
      calledDeleteItemIds.push(cartItemId);
    },
  });

  assert.deepEqual(calledCreateOrderProductIds, [1, 2]);
  assert.deepEqual(calledDeleteItemIds, ['cart-1']);
  assert.equal(result.successCount, 1);
  assert.equal(result.failedCartItemId, 'cart-2');
  assert.deepEqual(result.remainingCartItemIds, ['cart-2', 'cart-3']);
});
