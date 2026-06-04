import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFavoriteToggle, removeFavoriteProductId } from '../src/lib/favorites.ts';

test('applyFavoriteToggle 会在未收藏时加入商品 ID', () => {
  const next = applyFavoriteToggle(new Set([2, 3]), 5, true);
  assert.deepEqual([...next].sort((a, b) => a - b), [2, 3, 5]);
});

test('applyFavoriteToggle 会在已收藏时移除商品 ID', () => {
  const next = applyFavoriteToggle(new Set([2, 3, 5]), 5, false);
  assert.deepEqual([...next].sort((a, b) => a - b), [2, 3]);
});

test('removeFavoriteProductId 会从收藏列表中删除指定商品', () => {
  const next = removeFavoriteProductId(
    [
      { product_id: 11, name: 'A', description: '', price: 1, category_id: 1, image_url: '', status: 1, favorited_at: 1 },
      { product_id: 12, name: 'B', description: '', price: 2, category_id: 1, image_url: '', status: 1, favorited_at: 2 },
    ],
    11,
  );
  assert.deepEqual(
    next.map((item) => item.product_id),
    [12],
  );
});
