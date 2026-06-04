import { apiRequest } from './client.ts';
import type { AddressListResponse, AddressUpsertPayload, UserAddress } from '../lib/types';

/**
 * 统一将网关地址对象归一化为前端使用的地址模型，
 * 同时兼容 snake_case 与 camelCase 字段，避免页面层直接感知序列化差异。
 */
function normalizeAddress(raw: any): UserAddress {
  return {
    id: raw.id ?? 0,
    user_id: raw.user_id ?? raw.userId ?? 0,
    receiver_name: raw.receiver_name ?? raw.receiverName ?? '',
    receiver_phone: raw.receiver_phone ?? raw.receiverPhone ?? '',
    province: raw.province ?? '',
    city: raw.city ?? '',
    district: raw.district ?? '',
    address_line: raw.address_line ?? raw.addressLine ?? '',
    postal_code: raw.postal_code ?? raw.postalCode ?? '',
    is_default: raw.is_default ?? raw.isDefault ?? false,
    created_at: raw.created_at ?? raw.createdAt ?? '',
    updated_at: raw.updated_at ?? raw.updatedAt ?? '',
  };
}

/**
 * 读取当前登录用户的地址簿列表。
 */
export async function fetchAddresses(): Promise<AddressListResponse> {
  const raw = await apiRequest<any>('/api/v1/addresses', undefined, { auth: true });
  return {
    addresses: (raw.addresses ?? []).map((item: any) => normalizeAddress(item)),
  };
}

/**
 * 读取单条地址详情。
 */
export async function fetchAddress(addressId: number): Promise<UserAddress> {
  const raw = await apiRequest<any>(`/api/v1/addresses/${addressId}`, undefined, { auth: true });
  return normalizeAddress(raw.address);
}

/**
 * 创建一条新地址。
 */
export async function createAddress(payload: AddressUpsertPayload): Promise<UserAddress> {
  const raw = await apiRequest<any>(
    '/api/v1/addresses',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: true },
  );
  return normalizeAddress(raw.address);
}

/**
 * 更新一条地址。
 */
export async function updateAddress(addressId: number, payload: AddressUpsertPayload): Promise<UserAddress> {
  const raw = await apiRequest<any>(
    `/api/v1/addresses/${addressId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    { auth: true },
  );
  return normalizeAddress(raw.address);
}

/**
 * 删除一条地址。
 */
export async function deleteAddress(addressId: number): Promise<{ message: string }> {
  return apiRequest(
    `/api/v1/addresses/${addressId}`,
    {
      method: 'DELETE',
    },
    { auth: true },
  );
}

/**
 * 将指定地址设置为默认地址。
 */
export async function setDefaultAddress(addressId: number): Promise<UserAddress> {
  const raw = await apiRequest<any>(
    '/api/v1/addresses/default',
    {
      method: 'POST',
      body: JSON.stringify({ address_id: addressId }),
    },
    { auth: true },
  );
  return normalizeAddress(raw.address);
}
