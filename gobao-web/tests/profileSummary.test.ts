import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEntryCountLabel, resolveProfileSummary } from '../src/lib/profileSummary.ts';

test('resolveProfileSummary 会输出订单、收藏和地址的真实概览文案', () => {
  assert.equal(
    resolveProfileSummary({
      orderCount: 3,
      favoriteCount: 5,
      addressCount: 2,
    }),
    '当前共有 3 笔订单、5 件收藏、2 条地址。',
  );
});

test('resolveProfileSummary 会兼容空状态文案', () => {
  assert.equal(
    resolveProfileSummary({
      orderCount: 0,
      favoriteCount: 0,
      addressCount: 0,
    }),
    '当前还没有订单、收藏或地址记录。',
  );
});

test('resolveEntryCountLabel 按维度输出对应单位的计数', () => {
  const summary = { orderCount: 3, favoriteCount: 5, addressCount: 2 };
  assert.equal(resolveEntryCountLabel(summary, 'orders'), '3 笔');
  assert.equal(resolveEntryCountLabel(summary, 'favorites'), '5 件');
  assert.equal(resolveEntryCountLabel(summary, 'addresses'), '2 个');
});

test('resolveEntryCountLabel 对无计数维度回退为进入提示', () => {
  const summary = { orderCount: 3, favoriteCount: 5, addressCount: 2 };
  assert.equal(resolveEntryCountLabel(summary, null), '进入');
});
