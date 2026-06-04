import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHomeHeroCopy, resolveFavoritesPanelCopy } from '../src/lib/storeCopy.ts';

test('resolveHomeHeroCopy 会输出成品语气的首页概览文案', () => {
  assert.equal(resolveHomeHeroCopy(true), '你已经可以直接前往个人页、收藏和地址管理继续操作。');
  assert.equal(resolveHomeHeroCopy(false), '你可以先浏览商品，再登录继续订单、收藏和地址操作。');
});

test('resolveFavoritesPanelCopy 会输出成品语气的收藏说明', () => {
  assert.equal(resolveFavoritesPanelCopy(), '在这里集中管理你收藏的商品，随时查看、取消或继续选购。');
});
