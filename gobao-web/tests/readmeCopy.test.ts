import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('README 使用当前独立商品版本语义而不是旧 SKU 心智', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

  assert.ok(!readme.includes('商品详情与 SKU 选配'));
  assert.ok(!readme.includes('商品列表、商品详情、SKU 选配'));
  assert.ok(!readme.includes('提供商品、SKU、库存真值'));
});
