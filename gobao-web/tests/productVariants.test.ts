import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProductVariant } from '../src/lib/types.ts';
import {
  buildVariantSpecGroups,
  findBestMatchingVariant,
  parseVariantSpecValues,
  resolveVariantSpecLabel,
} from '../src/lib/productVariants.ts';

const variants: ProductVariant[] = [
  {
    id: 101,
    group_id: 10,
    image_url: '',
    price: 1299900,
    stock_quantity: 10,
    status: 1,
    spec_label: '256GB / 银色',
    spec_values_json: '{"capacity":"256GB","color":"银色"}',
  },
  {
    id: 102,
    group_id: 10,
    image_url: '',
    price: 1499900,
    stock_quantity: 8,
    status: 1,
    spec_label: '512GB / 银色',
    spec_values_json: '{"capacity":"512GB","color":"银色"}',
  },
  {
    id: 103,
    group_id: 10,
    image_url: '',
    price: 1499900,
    stock_quantity: 5,
    status: 1,
    spec_label: '512GB / 深空黑',
    spec_values_json: '{"capacity":"512GB","color":"深空黑"}',
  },
];

test('parseVariantSpecValues 会解析后端返回的规格 JSON', () => {
  assert.deepEqual(parseVariantSpecValues('{"memory":"16GB","color":"深空黑"}'), {
    memory: '16GB',
    color: '深空黑',
  });
});

test('resolveVariantSpecLabel 会将常见电子商品规格字段转成中文', () => {
  assert.equal(resolveVariantSpecLabel('capacity'), '容量');
  assert.equal(resolveVariantSpecLabel('color'), '颜色');
  assert.equal(resolveVariantSpecLabel('unknown_key'), 'unknown_key');
});

test('buildVariantSpecGroups 会生成当前版本对应的可选规格组', () => {
  const groups = buildVariantSpecGroups(variants, 102);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.label, '容量');
  assert.equal(groups[0]?.selected_value, '512GB');
  assert.equal(groups[1]?.label, '颜色');
  assert.equal(groups[1]?.values.find((item) => item.value === '银色')?.selected, true);
});

test('buildVariantSpecGroups 优先使用商品组规格维度控制显示顺序', () => {
  const groups = buildVariantSpecGroups(variants, 102, ['color', 'capacity']);

  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.key, 'color');
  assert.equal(groups[1]?.key, 'capacity');
});

test('buildVariantSpecGroups 会隐藏商品组未配置的版本规格维度', () => {
  const groups = buildVariantSpecGroups(variants, 102, ['capacity']);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.key, 'capacity');
});

test('findBestMatchingVariant 会优先返回最匹配的真实独立商品版本', () => {
  const nextVariant = findBestMatchingVariant({
    variants,
    selectedVariantId: 101,
    specKey: 'capacity',
    specValue: '512GB',
  });

  assert.equal(nextVariant?.id, 102);
});
