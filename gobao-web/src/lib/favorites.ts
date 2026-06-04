import type { FavoriteItem } from './types';

/**
 * 将收藏列表转换为商品 ID 集合，便于商品列表页和详情页快速判断当前商品是否已收藏。
 */
export function buildFavoriteProductIdSet(items: FavoriteItem[]): Set<number> {
  return new Set(items.map((item) => item.product_id));
}

/**
 * 按目标收藏状态更新商品 ID 集合。
 * 这里返回新的 Set，避免直接原地修改 React state 导致页面不刷新。
 */
export function applyFavoriteToggle(current: Set<number>, productId: number, shouldFavorite: boolean): Set<number> {
  const next = new Set(current);
  if (shouldFavorite) {
    next.add(productId);
    return next;
  }
  next.delete(productId);
  return next;
}

/**
 * 从收藏列表中移除指定商品，供收藏页和其他本地回显场景复用。
 */
export function removeFavoriteProductId(items: FavoriteItem[], productId: number): FavoriteItem[] {
  return items.filter((item) => item.product_id !== productId);
}
