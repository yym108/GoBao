import { apiRequest } from './client';
import type { Cart } from '../lib/types';

export interface AddCartItemPayload {
  product_id: number;
  quantity: number;
}

function normalizeCart(raw: any): Cart {
  return {
    items: (raw.items ?? []).map((item: any) => ({
      cart_item_id: item.cart_item_id ?? item.cartItemID ?? '',
      product_id: item.product_id ?? item.productId ?? 0,
      name: item.name ?? '',
      price: item.price ?? 0,
      quantity: item.quantity ?? 0,
      image_url: item.image_url ?? item.imageUrl ?? '',
      option_summary: item.option_summary ?? item.optionSummary ?? '',
      status: item.status ?? 0,
      available: item.available ?? false,
      unavailable_reason: item.unavailable_reason ?? item.unavailableReason ?? '',
    })),
    total_quantity: raw.total_quantity ?? raw.totalQuantity ?? 0,
    total_amount: raw.total_amount ?? raw.totalAmount ?? 0,
  };
}

export async function fetchCart(): Promise<Cart> {
  const raw = await apiRequest<any>('/api/v1/cart', undefined, { auth: true });
  return normalizeCart(raw);
}

export async function addCartItem(payload: AddCartItemPayload): Promise<Cart> {
  const raw = await apiRequest<any>(
    '/api/v1/cart/items',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: true },
  );
  return normalizeCart(raw);
}

export async function updateCartItem(cartItemId: string, quantity: number): Promise<Cart> {
  const raw = await apiRequest<any>(
    `/api/v1/cart/items/${encodeURIComponent(cartItemId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    },
    { auth: true },
  );
  return normalizeCart(raw);
}

export function deleteCartItem(cartItemId: string): Promise<void> {
  return apiRequest(
    `/api/v1/cart/items/${encodeURIComponent(cartItemId)}`,
    {
      method: 'DELETE',
    },
    { auth: true },
  );
}
