import { apiRequest } from './client';
import type { FavoriteItem, FavoriteListResponse } from '../lib/types';

/**
 * 将后端收藏商品响应统一归一化为前端内部结构，
 * 兼容 snake_case 与 camelCase 字段，避免网关序列化细节直接渗透到页面层。
 */
function normalizeFavoriteItem(raw: any): FavoriteItem {
  return {
    product_id: raw.product_id ?? raw.productId ?? 0,
    name: raw.name ?? '',
    description: raw.description ?? '',
    price: raw.price ?? 0,
    category_id: raw.category_id ?? raw.categoryId ?? 0,
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    status: raw.status ?? 0,
    favorited_at: raw.favorited_at ?? raw.favoritedAt ?? 0,
    available: raw.available ?? false,
    unavailable_reason: raw.unavailable_reason ?? raw.unavailableReason ?? '',
  };
}

/**
 * 读取当前登录用户的收藏列表。
 */
export async function fetchFavorites(): Promise<FavoriteListResponse> {
  const raw = await apiRequest<any>('/api/v1/favorites', undefined, { auth: true });
  return {
    items: (raw.items ?? []).map((item: any) => normalizeFavoriteItem(item)),
    total: raw.total ?? 0,
  };
}

/**
 * 将指定商品加入收藏，后端会回填商品名称、价格与图片快照。
 */
export async function addFavorite(productId: number): Promise<FavoriteListResponse> {
  const raw = await apiRequest<any>(
    '/api/v1/favorites',
    {
      method: 'POST',
      body: JSON.stringify({ product_id: productId }),
    },
    { auth: true },
  );
  return {
    items: (raw.items ?? []).map((item: any) => normalizeFavoriteItem(item)),
    total: raw.total ?? 0,
  };
}

/**
 * 取消指定商品收藏。
 */
export function deleteFavorite(productId: number): Promise<void> {
  return apiRequest(
    `/api/v1/favorites/${productId}`,
    {
      method: 'DELETE',
    },
    { auth: true },
  );
}
