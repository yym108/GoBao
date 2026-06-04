import { apiRequest } from './client.ts';
import type { Category, ProductDetailResponse, ProductListItem, ProductMedia } from '../lib/types.ts';

export interface ProductListParams {
  categoryId?: number;
  page?: number;
  pageSize?: number;
}

export function fetchCategories(): Promise<{ items: Category[] }> {
  return apiRequest('/api/v1/categories');
}

export function fetchProducts(params: ProductListParams): Promise<{ items: ProductListItem[]; total: number }> {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.pageSize ?? 12));
  if (params.categoryId && params.categoryId > 0) {
    query.set('category_id', String(params.categoryId));
  }

  return apiRequest(`/api/v1/products?${query.toString()}`).then((raw) => normalizeProductListResponse(raw));
}

/**
 * 将商品详情中的当前独立商品统一归一化，
 * 兼容 snake_case 与 camelCase 字段，避免网关序列化差异直接渗透到页面层。
 */
function normalizeProduct(raw: any) {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? '',
    description: raw.description ?? '',
    price: raw.price ?? 0,
    category_id: raw.category_id ?? raw.categoryId ?? 0,
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    status: raw.status ?? 0,
    stock_quantity: raw.stock_quantity ?? raw.stockQuantity ?? 0,
    group_id: raw.group_id ?? raw.groupId ?? 0,
    spec_label: raw.spec_label ?? raw.specLabel ?? '',
    spec_values_json: raw.spec_values_json ?? raw.specValuesJson ?? '',
    sort_order: raw.sort_order ?? raw.sortOrder ?? 0,
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
  };
}

/**
 * 将商品列表归一化并按商品组聚合，避免同组不同版本在首页重复陈列。
 * 当前策略保留每组排序最靠前的独立商品作为列表入口，版本切换交给详情页和选配弹窗。
 */
function normalizeProductListItem(raw: any): ProductListItem {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? '',
    description: raw.description ?? '',
    price: raw.price ?? 0,
    category_id: raw.category_id ?? raw.categoryId ?? 0,
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    cover_image_url: raw.cover_image_url ?? raw.coverImageUrl ?? '',
    status: raw.status ?? 0,
    group_id: raw.group_id ?? raw.groupId ?? 0,
    spec_label: raw.spec_label ?? raw.specLabel ?? '',
    spec_values_json: raw.spec_values_json ?? raw.specValuesJson ?? '',
    sort_order: raw.sort_order ?? raw.sortOrder ?? 0,
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
  };
}

/**
 * 聚合同组版本，只保留每组用于列表入口的默认版本卡片。
 * 若 group_id 缺失，则回退按商品自身 id 保留，确保兼容旧数据。
 */
export function normalizeProductListResponse(raw: any): { items: ProductListItem[]; total: number } {
  const items = (raw.items ?? raw.Items ?? []).map((item: any) => normalizeProductListItem(item));
  const grouped = new Map<number, ProductListItem>();

  for (const item of items) {
    const groupKey = item.group_id && item.group_id > 0 ? item.group_id : item.id;
    const current = grouped.get(groupKey);
    if (!current) {
      grouped.set(groupKey, item);
      continue;
    }
    const currentSort = current.sort_order ?? Number.MAX_SAFE_INTEGER;
    const nextSort = item.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (nextSort < currentSort || (nextSort === currentSort && item.id < current.id)) {
      grouped.set(groupKey, item);
    }
  }

  const normalizedItems = Array.from(grouped.values());

  return {
    items: normalizedItems,
    total: normalizedItems.length,
  };
}

/**
 * 将商品组信息归一化为前端内部结构，
 * 当前主要服务于详情页标题、头图和同组版本切换展示。
 */
function normalizeProductGroup(raw: any) {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? '',
    slug: raw.slug ?? '',
    hero_title: raw.hero_title ?? raw.heroTitle ?? '',
    hero_subtitle: raw.hero_subtitle ?? raw.heroSubtitle ?? '',
    hero_image_url: raw.hero_image_url ?? raw.heroImageUrl ?? '',
    cover_image_url: raw.cover_image_url ?? raw.coverImageUrl ?? '',
    default_product_id: raw.default_product_id ?? raw.defaultProductId ?? 0,
    category_id: raw.category_id ?? raw.categoryId ?? 0,
    status: raw.status ?? 0,
    sort_order: raw.sort_order ?? raw.sortOrder ?? 0,
    spec_keys: raw.spec_keys ?? raw.specKeys ?? [],
  };
}

function normalizeProductMedia(raw: any): ProductMedia {
  return {
    id: Number(raw.id ?? 0),
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    alt_text: raw.alt_text ?? raw.altText ?? '',
    sort_order: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    is_primary: Boolean(raw.is_primary ?? raw.isPrimary ?? false),
    binding_id: Number(raw.binding_id ?? raw.bindingId ?? 0),
    usage_type: raw.usage_type ?? raw.usageType ?? '',
  };
}

/**
 * 将同组独立商品版本归一化为统一列表，
 * 价格、库存与可售状态全部以后端版本快照为准，前端只负责展示与切换。
 */
function normalizeProductVariant(raw: any) {
  return {
    id: raw.id ?? 0,
    group_id: raw.group_id ?? raw.groupId ?? 0,
    name: raw.name ?? '',
    description: raw.description ?? '',
    price: raw.price ?? 0,
    category_id: raw.category_id ?? raw.categoryId ?? 0,
    image_url: raw.image_url ?? raw.imageUrl ?? '',
    stock_quantity: raw.stock_quantity ?? raw.stockQuantity ?? 0,
    status: raw.status ?? 0,
    spec_label: raw.spec_label ?? raw.specLabel ?? '',
    spec_values_json: raw.spec_values_json ?? raw.specValuesJson ?? '',
    sort_order: raw.sort_order ?? raw.sortOrder ?? 0,
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
  };
}

export function normalizeProductDetailResponse(raw: any): ProductDetailResponse {
  const product = normalizeProduct(raw.product ?? {});
  const variants = (raw.variants ?? raw.Variants ?? []).map((variant: any) => normalizeProductVariant(variant));
  const normalizedVariants = variants.length > 0 ? variants : [{
    id: product.id,
    group_id: product.group_id,
    name: product.name,
    description: product.description,
    price: product.price,
    category_id: product.category_id,
    image_url: product.image_url,
    stock_quantity: product.stock_quantity,
    status: product.status,
    spec_label: product.spec_label,
    spec_values_json: product.spec_values_json,
    sort_order: product.sort_order,
    created_at: product.created_at,
    updated_at: product.updated_at,
  }];

  return {
    product,
    group: normalizeProductGroup(raw.group ?? {}),
    variants: normalizedVariants,
    default_product_id: raw.default_product_id ?? raw.defaultProductId ?? product.id ?? 0,
    group_medias: (raw.group_medias ?? raw.groupMedias ?? []).map((item: any) => normalizeProductMedia(item)),
    product_medias: (raw.product_medias ?? raw.productMedias ?? []).map((item: any) => normalizeProductMedia(item)),
    resolved_medias: (raw.resolved_medias ?? raw.resolvedMedias ?? []).map((item: any) => normalizeProductMedia(item)),
  };
}

export async function fetchProduct(productId: number): Promise<ProductDetailResponse> {
  const raw = await apiRequest<any>(`/api/v1/products/${productId}`);
  return normalizeProductDetailResponse(raw);
}
