import type { Category, ProductVariant } from './types';

/**
 * /products 列表卡片的预览态。
 * 标题、封面取后台二级页实时编辑值，价格与描述取默认版本后端真值，
 * 与用户端 ProductCard 保持同一套展示口径，避免后台预览和实际展示口径偏差。
 */
export interface ProductCardPreviewState {
  category_name: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  availability_message: string;
  on_sale: boolean;
  spec_label: string;
}

/** 构造列表卡片预览所需的输入。 */
export interface ProductCardPreviewInput {
  /** 卡片标题，实时取自商品组编辑表单。 */
  title: string;
  /** 封面图，实时取自商品组编辑表单。 */
  coverImageUrl: string;
  /** 商品组类目，作为版本未单独标注类目时的回退。 */
  fallbackCategoryId: number;
  /** 默认版本，价格、描述、可售状态等真值来源。 */
  defaultVariant: ProductVariant | null;
  categories: Category[];
}

/**
 * 把类目编号转换为类目名称。
 * 预览卡片直接展示可读类目，缺失时回退为带 ID 的占位名。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

/**
 * 从版本集合中解析出默认版本。
 * 优先匹配后端返回的默认商品 ID，找不到时回退到第一个版本，空集合返回 null。
 */
export function resolveDefaultVariant(
  variants: ProductVariant[],
  defaultProductId: number,
): ProductVariant | null {
  if (variants.length === 0) {
    return null;
  }
  return variants.find((item) => item.id === defaultProductId) ?? variants[0];
}

/**
 * 判断版本是否处于前台在售状态。
 * 仅启用且仍有库存的版本视为可售，与用户端购买判断保持一致。
 */
export function isVariantOnSale(variant: ProductVariant | null): boolean {
  if (!variant) {
    return false;
  }
  return variant.status === 1 && variant.stock_quantity > 0;
}

/**
 * 生成 /products 列表卡片使用的状态提示。
 * 文案对齐用户端 ProductCard，避免后台预览和实际展示出现口径偏差。
 */
export function resolveVariantAvailabilityMessage(variant: ProductVariant | null): string {
  if (!variant) {
    return '当前商品暂不可购买';
  }
  if (variant.status !== 1) {
    return '当前商品暂时无法购买';
  }
  if (variant.stock_quantity <= 0) {
    return '当前暂时缺货';
  }
  return '当前可购买';
}

/**
 * 从同组子商品版本的规格 JSON 中推导商品组规格维度。
 * 用于兼容历史数据：子商品已经有规格值，但商品组还没有写入 spec_keys 时，后台仍能恢复可编辑维度。
 */
export function deriveSpecKeysFromVariants(variants: ProductVariant[]): string[] {
  const keys: string[] = [];

  for (const variant of variants) {
    if (!variant.spec_values_json?.trim()) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(variant.spec_values_json);
    } catch {
      continue;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      continue;
    }

    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      const normalizedKey = key.trim();
      if (normalizedKey && !keys.includes(normalizedKey)) {
        keys.push(normalizedKey);
      }
    }
  }

  return keys;
}

/**
 * 汇总商品组实时编辑值与默认版本真值，生成单张列表卡片预览态。
 * 一个商品组在前台只展示一张卡，因此这里只构造一张代表卡：
 * 标题、封面跟随后台实时编辑，价格、描述、可售状态全部以默认版本后端真值为准。
 */
export function buildProductCardPreview(input: ProductCardPreviewInput): ProductCardPreviewState {
  const { title, coverImageUrl, fallbackCategoryId, defaultVariant, categories } = input;
  const categoryId = defaultVariant?.category_id || fallbackCategoryId;

  return {
    category_name: resolveCategoryName(categories, categoryId),
    name: title.trim() || defaultVariant?.name || '未命名商品组',
    description: (defaultVariant?.description ?? '').trim() || '当前商品暂无补充描述。',
    price: defaultVariant?.price ?? 0,
    image_url: coverImageUrl.trim() || defaultVariant?.image_url || '',
    availability_message: resolveVariantAvailabilityMessage(defaultVariant),
    on_sale: isVariantOnSale(defaultVariant),
    spec_label: defaultVariant?.spec_label || '',
  };
}
