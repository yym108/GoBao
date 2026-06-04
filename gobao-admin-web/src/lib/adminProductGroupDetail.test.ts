import { describe, expect, it } from 'vitest';
import {
  buildProductCardPreview,
  deriveSpecKeysFromVariants,
  isVariantOnSale,
  resolveDefaultVariant,
  resolveVariantAvailabilityMessage,
} from './adminProductGroupDetail';
import type { Category, ProductVariant } from './types';

/**
 * 构造一个最小可用的版本测试数据，
 * 仅覆盖预览纯逻辑关心的字段，其余字段给安全默认值。
 */
function makeVariant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: 1,
    group_id: 5001,
    name: 'MacBook Air 256G',
    description: 'M4 芯片轻薄本',
    price: 849900,
    category_id: 2,
    image_url: '/media/variant.jpg',
    stock_quantity: 12,
    status: 1,
    spec_label: 'M4 / 16GB / 256GB',
    spec_values_json: '{}',
    ...overrides,
  };
}

const categories: Category[] = [
  { id: 2, name: '数码', sort_order: 1, created_at: 0, updated_at: 0 },
];

describe('resolveDefaultVariant', () => {
  it('优先返回与默认商品 ID 匹配的版本', () => {
    const variants = [makeVariant({ id: 1 }), makeVariant({ id: 2 })];
    expect(resolveDefaultVariant(variants, 2)?.id).toBe(2);
  });

  it('默认商品 ID 不存在时回退到第一个版本', () => {
    const variants = [makeVariant({ id: 1 }), makeVariant({ id: 2 })];
    expect(resolveDefaultVariant(variants, 999)?.id).toBe(1);
  });

  it('版本为空时返回 null', () => {
    expect(resolveDefaultVariant([], 1)).toBeNull();
  });
});

describe('isVariantOnSale', () => {
  it('启用且有库存时可售', () => {
    expect(isVariantOnSale(makeVariant({ status: 1, stock_quantity: 5 }))).toBe(true);
  });

  it('启用但无库存时不可售', () => {
    expect(isVariantOnSale(makeVariant({ status: 1, stock_quantity: 0 }))).toBe(false);
  });

  it('停用时不可售', () => {
    expect(isVariantOnSale(makeVariant({ status: 2, stock_quantity: 5 }))).toBe(false);
  });

  it('空版本不可售', () => {
    expect(isVariantOnSale(null)).toBe(false);
  });
});

describe('resolveVariantAvailabilityMessage', () => {
  it('空版本提示不可购买', () => {
    expect(resolveVariantAvailabilityMessage(null)).toBe('当前商品暂不可购买');
  });

  it('停用版本提示暂时无法购买', () => {
    expect(resolveVariantAvailabilityMessage(makeVariant({ status: 2 }))).toBe('当前商品暂时无法购买');
  });

  it('缺货版本提示暂时缺货', () => {
    expect(resolveVariantAvailabilityMessage(makeVariant({ status: 1, stock_quantity: 0 }))).toBe('当前暂时缺货');
  });

  it('正常版本提示可购买', () => {
    expect(resolveVariantAvailabilityMessage(makeVariant({ status: 1, stock_quantity: 3 }))).toBe('当前可购买');
  });
});

describe('buildProductCardPreview', () => {
  it('价格与描述取默认版本真值，不受卡片输入影响', () => {
    const preview = buildProductCardPreview({
      title: '展示标题',
      coverImageUrl: '',
      fallbackCategoryId: 2,
      defaultVariant: makeVariant({ price: 999900, description: '版本真实描述' }),
      categories,
    });

    expect(preview.price).toBe(999900);
    expect(preview.description).toBe('版本真实描述');
  });

  it('标题与封面取实时编辑值，覆盖版本自身字段', () => {
    const preview = buildProductCardPreview({
      title: '实时标题',
      coverImageUrl: '/media/live-cover.jpg',
      fallbackCategoryId: 2,
      defaultVariant: makeVariant({ name: '版本名', image_url: '/media/variant.jpg' }),
      categories,
    });

    expect(preview.name).toBe('实时标题');
    expect(preview.image_url).toBe('/media/live-cover.jpg');
  });

  it('封面为空时回退到默认版本图片', () => {
    const preview = buildProductCardPreview({
      title: '标题',
      coverImageUrl: '',
      fallbackCategoryId: 2,
      defaultVariant: makeVariant({ image_url: '/media/variant.jpg' }),
      categories,
    });

    expect(preview.image_url).toBe('/media/variant.jpg');
  });

  it('无默认版本时给出安全占位且价格为 0', () => {
    const preview = buildProductCardPreview({
      title: '',
      coverImageUrl: '',
      fallbackCategoryId: 2,
      defaultVariant: null,
      categories,
    });

    expect(preview.name).toBe('未命名商品组');
    expect(preview.description).toBe('当前商品暂无补充描述。');
    expect(preview.price).toBe(0);
    expect(preview.on_sale).toBe(false);
  });

  it('类目优先取版本类目，缺失时回退商品组类目', () => {
    const preview = buildProductCardPreview({
      title: '标题',
      coverImageUrl: '',
      fallbackCategoryId: 2,
      defaultVariant: makeVariant({ category_id: 0 }),
      categories,
    });

    expect(preview.category_name).toBe('数码');
  });
});

describe('deriveSpecKeysFromVariants', () => {
  it('会从同组子商品规格 JSON 中按出现顺序推导规格维度', () => {
    const variants = [
      makeVariant({ spec_values_json: '{"芯片":"M4","内存":"16GB"}' }),
      makeVariant({ spec_values_json: '{"内存":"24GB","存储":"512GB"}' }),
    ];

    expect(deriveSpecKeysFromVariants(variants)).toEqual(['芯片', '内存', '存储']);
  });

  it('会忽略非法规格 JSON 与重复维度', () => {
    const variants = [
      makeVariant({ spec_values_json: '{bad json' }),
      makeVariant({ spec_values_json: '{"颜色":"银色","颜色":"银色"}' }),
      makeVariant({ spec_values_json: '[]' }),
    ];

    expect(deriveSpecKeysFromVariants(variants)).toEqual(['颜色']);
  });
});
