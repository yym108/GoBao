import { apiRequest } from './client.ts';
import type {
  Category,
  MediaAssetInfo,
  ProductDetail,
  ProductDetailResponse,
  ProductGroup,
  ProductGroupMediaBinding,
  ProductListItem,
  ProductMedia,
  ProductMediaBinding,
} from '../lib/types.ts';

export interface ProductListParams {
  categoryId?: number;
  page?: number;
  pageSize?: number;
}

export interface AdminUpsertCategoryPayload {
  name: string;
  sort_order: number;
}

export interface AdminUpsertProductPayload {
  name: string;
  description: string;
  price: number;
  category_id: number;
  image_url: string;
  group_id: number;
  spec_label: string;
  spec_values_json: string;
  sort_order: number;
  status: number;
  initial_stock?: number;
}

export interface AdminUpdateStockPayload {
  quantity: number;
  expected_version: number;
}

export interface ProductGroupListParams {
  categoryId?: number;
  page?: number;
  pageSize?: number;
}

export interface AdminUpsertProductGroupPayload {
  name: string;
  slug: string;
  hero_title: string;
  hero_subtitle: string;
  hero_image_url: string;
  category_id: number;
  status: number;
  sort_order: number;
  cover_image_url: string;
  spec_keys: string[];
}

export function fetchCategories(): Promise<{ items: Category[] }> {
  return apiRequest('/api/v1/categories');
}

/**
 * 后台创建类目。
 * 顶部导航、商品筛选与商品组归属统一依赖类目数据，因此类目需要走后台真值维护。
 */
export async function createAdminCategory(payload: AdminUpsertCategoryPayload): Promise<{ category: Category }> {
  const raw = await apiRequest<any>('/api/v1/admin/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    category: raw.category ?? {},
  };
}

/**
 * 后台更新类目。
 * 当前仅维护名称和排序，避免把前台导航入口继续写死在代码里。
 */
export async function updateAdminCategory(categoryId: number, payload: AdminUpsertCategoryPayload): Promise<{ category: Category }> {
  const raw = await apiRequest<any>(`/api/v1/admin/categories/${categoryId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    category: raw.category ?? {},
  };
}

/**
 * 后台删除类目。
 * 删除后若该类目下原先含有商品组，网关会返回 warning 提示前端补充提醒运营。
 */
export function deleteAdminCategory(categoryId: number): Promise<{ warning?: string }> {
  return apiRequest(`/api/v1/admin/categories/${categoryId}`, {
    method: 'DELETE',
  }, { adminAuth: true });
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
    stock_version: raw.stock_version ?? raw.stockVersion ?? 0,
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
    created_at: raw.created_at ?? raw.createdAt ?? 0,
    updated_at: raw.updated_at ?? raw.updatedAt ?? 0,
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
 * 将媒体资源元数据归一化为后台可直接消费的结构，
 * 避免 proto JSON 的命名风格差异直接泄露到页面层。
 */
function normalizeMediaAssetInfo(raw: any): MediaAssetInfo {
  return {
    id: Number(raw.id ?? 0),
    storage_key: raw.storage_key ?? raw.storageKey ?? '',
    public_url: raw.public_url ?? raw.publicUrl ?? '',
    file_name: raw.file_name ?? raw.fileName ?? '',
    mime_type: raw.mime_type ?? raw.mimeType ?? '',
    size_bytes: Number(raw.size_bytes ?? raw.sizeBytes ?? 0),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    alt_text: raw.alt_text ?? raw.altText ?? '',
    created_at: Number(raw.created_at ?? raw.createdAt ?? 0),
    updated_at: Number(raw.updated_at ?? raw.updatedAt ?? 0),
  };
}

/**
 * 将商品组媒体绑定结果归一化，
 * 供后台媒体页在上传后直接展示绑定结果，并支持后续删除绑定。
 */
function normalizeProductGroupMediaBinding(raw: any): ProductGroupMediaBinding {
  return {
    id: Number(raw.id ?? 0),
    group_id: Number(raw.group_id ?? raw.groupId ?? 0),
    media_id: Number(raw.media_id ?? raw.mediaId ?? 0),
    usage_type: raw.usage_type ?? raw.usageType ?? '',
    sort_order: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    is_primary: Boolean(raw.is_primary ?? raw.isPrimary ?? false),
    media: normalizeMediaAssetInfo(raw.media ?? {}),
  };
}

/**
 * 将独立商品媒体绑定结果归一化，
 * 供后台媒体页在商品版本差异图场景中直接消费。
 */
function normalizeProductMediaBinding(raw: any): ProductMediaBinding {
  return {
    id: Number(raw.id ?? 0),
    product_id: Number(raw.product_id ?? raw.productId ?? 0),
    media_id: Number(raw.media_id ?? raw.mediaId ?? 0),
    usage_type: raw.usage_type ?? raw.usageType ?? '',
    sort_order: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    is_primary: Boolean(raw.is_primary ?? raw.isPrimary ?? false),
    media: normalizeMediaAssetInfo(raw.media ?? {}),
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
    stock_version: raw.stock_version ?? raw.stockVersion ?? 0,
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

/**
 * 查询商品组列表。
 * 后台商品页用它驱动商品组选择，不再手工输入 group_id。
 */
export async function fetchProductGroups(params: ProductGroupListParams): Promise<{ items: ProductGroup[]; total: number }> {
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('page_size', String(params.pageSize ?? 20));
  if (params.categoryId && params.categoryId > 0) {
    query.set('category_id', String(params.categoryId));
  }
  const raw = await apiRequest<any>(`/api/v1/product-groups?${query.toString()}`);
  return {
    items: (raw.items ?? raw.Items ?? []).map((item: any) => normalizeProductGroup(item)),
    total: Number(raw.total ?? raw.Total ?? 0),
  };
}

/**
 * 后台创建商品组。
 * 商品组负责系列页展示元信息，不直接参与交易真值计算。
 */
export async function createAdminProductGroup(payload: AdminUpsertProductGroupPayload): Promise<{ group: ProductGroup }> {
  const raw = await apiRequest<any>('/api/v1/admin/product-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    group: normalizeProductGroup(raw.group ?? {}),
  };
}

/**
 * 后台更新商品组。
 * 系列名称、slug、Hero 图与封面图都以后端存储为准。
 */
export async function updateAdminProductGroup(groupId: number, payload: AdminUpsertProductGroupPayload): Promise<{ group: ProductGroup }> {
  const raw = await apiRequest<any>(`/api/v1/admin/product-groups/item/${groupId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    group: normalizeProductGroup(raw.group ?? {}),
  };
}

/**
 * 后台删除商品组。
 * 若商品组下仍有关联独立商品，后端会阻止删除。
 */
export function deleteAdminProductGroup(groupId: number): Promise<void> {
  return apiRequest(`/api/v1/admin/product-groups/item/${groupId}`, {
    method: 'DELETE',
  }, { adminAuth: true });
}

/**
 * 后台创建一个独立商品版本。
 * 当前最小实现要求明确指定已有商品组，避免继续写入脱离商品组的旧结构数据。
 */
export async function createAdminProduct(payload: AdminUpsertProductPayload): Promise<{ product: ProductDetail }> {
  const raw = await apiRequest<any>('/api/v1/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    product: normalizeProduct(raw.product ?? {}),
  };
}

/**
 * 后台更新一个独立商品版本。
 * 商品价格、规格、所属商品组和排序都以后端存储为准，前端只做表单承接。
 */
export async function updateAdminProduct(productId: number, payload: AdminUpsertProductPayload): Promise<{ product: ProductDetail }> {
  const raw = await apiRequest<any>(`/api/v1/admin/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    product: normalizeProduct(raw.product ?? {}),
  };
}

/**
 * 后台删除一个独立商品版本。
 * 当前仍保留商品组本身，删除的是交易真值对应的独立商品。
 */
export function deleteAdminProduct(productId: number): Promise<void> {
  return apiRequest(`/api/v1/admin/products/${productId}`, {
    method: 'DELETE',
  }, { adminAuth: true });
}

/**
 * 后台直接设置某个独立商品版本的库存。
 * expected_version 来自最新详情快照，避免覆盖并发库存变化。
 */
export async function updateAdminProductStock(
  productId: number,
  payload: AdminUpdateStockPayload,
): Promise<{ stock_quantity: number; version: number }> {
  return apiRequest(`/api/v1/admin/products/${productId}/stock`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
}

export interface UploadAdminMediaPayload {
  folder: string;
  file_name: string;
  alt_text: string;
  mime_type: string;
  content_base64: string;
}

export interface BindGroupMediaPayload {
  media_id: number;
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
}

export interface BindProductMediaPayload {
  media_id: number;
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
}

export interface UpdateGroupMediaBindingPayload {
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
}

export interface UpdateProductMediaBindingPayload {
  usage_type: string;
  sort_order: number;
  is_primary: boolean;
}

/**
 * 上传后台媒体文件并返回媒体资源元数据。
 * 当前后台采用“先上传，再绑定”的两段式最小流程。
 */
export async function uploadAdminMedia(payload: UploadAdminMediaPayload): Promise<{ media: MediaAssetInfo }> {
  const raw = await apiRequest<any>('/api/v1/admin/media/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    media: normalizeMediaAssetInfo(raw.media ?? {}),
  };
}

/**
 * 将媒体绑定到商品组。
 * 商品组当前支持封面图、Hero 图和公共图库三类用途。
 */
export async function bindGroupMedia(
  groupId: number,
  payload: BindGroupMediaPayload,
): Promise<{ binding: ProductGroupMediaBinding }> {
  const raw = await apiRequest<any>(`/api/v1/admin/product-groups/${groupId}/media`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    binding: normalizeProductGroupMediaBinding(raw.binding ?? {}),
  };
}

/**
 * 将媒体绑定到独立商品。
 * 当前独立商品仅支持版本差异图库，因此 usage_type 固定走 gallery。
 */
export async function bindProductMedia(
  productId: number,
  payload: BindProductMediaPayload,
): Promise<{ binding: ProductMediaBinding }> {
  const raw = await apiRequest<any>(`/api/v1/admin/products/${productId}/media`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    binding: normalizeProductMediaBinding(raw.binding ?? {}),
  };
}

/**
 * 更新商品组上的一条媒体绑定。
 * 当前用于后台媒体页调整图片用途、排序和主图标记。
 */
export async function updateGroupMediaBinding(
  groupId: number,
  bindingId: number,
  payload: UpdateGroupMediaBindingPayload,
): Promise<{ binding: ProductGroupMediaBinding }> {
  const raw = await apiRequest<any>(`/api/v1/admin/product-groups/${groupId}/media/${bindingId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    binding: normalizeProductGroupMediaBinding(raw.binding ?? {}),
  };
}

/**
 * 更新独立商品上的一条媒体绑定。
 * 当前独立商品仍只支持图库图片，因此 usage_type 会固定传 gallery。
 */
export async function updateProductMediaBinding(
  productId: number,
  bindingId: number,
  payload: UpdateProductMediaBindingPayload,
): Promise<{ binding: ProductMediaBinding }> {
  const raw = await apiRequest<any>(`/api/v1/admin/products/${productId}/media/${bindingId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
  return {
    binding: normalizeProductMediaBinding(raw.binding ?? {}),
  };
}

/**
 * 删除商品组上的一条媒体绑定。
 * 这里删除的是绑定关系，不会直接物理删除媒体文件。
 */
export function deleteGroupMediaBinding(groupId: number, bindingId: number): Promise<void> {
  return apiRequest(`/api/v1/admin/product-groups/${groupId}/media/${bindingId}`, {
    method: 'DELETE',
  }, { adminAuth: true });
}

/**
 * 删除独立商品上的一条媒体绑定。
 * 当前主要用于移除某个版本的差异图库图片。
 */
export function deleteProductMediaBinding(productId: number, bindingId: number): Promise<void> {
  return apiRequest(`/api/v1/admin/products/${productId}/media/${bindingId}`, {
    method: 'DELETE',
  }, { adminAuth: true });
}
