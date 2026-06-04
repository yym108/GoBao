import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProductDetailResponse, normalizeProductListResponse } from '../src/api/catalog.ts';

test('normalizeProductDetailResponse 会兼容新的商品分组与变体结构', () => {
  const detail = normalizeProductDetailResponse({
    product: {
      id: 101,
      group_id: 10,
      name: 'MacBook Pro 14 英寸',
      description: '专业级笔记本电脑',
      price: 1499900,
      category_id: 3,
      image_url: 'https://example.com/macbook-pro.jpg',
      status: 1,
      stock_quantity: 7,
      spec_label: '512GB / 深空黑',
      spec_values_json: '{"capacity":"512GB","color":"深空黑"}',
      sort_order: 2,
      created_at: 1717010000,
      updated_at: 1717011000,
    },
    group: {
      id: 10,
      category_id: 3,
      name: 'MacBook Pro 14 英寸',
      hero_image_url: 'https://example.com/macbook-pro-hero.jpg',
      cover_image_url: 'https://img.example.com/group-cover.jpg',
      default_product_id: 101,
      status: 1,
      sort_order: 1,
      created_at: 1717010000,
      updated_at: 1717011000,
    },
    variants: [
      {
        id: 101,
        group_id: 10,
        name: 'MacBook Pro 14 英寸',
        description: '专业级笔记本电脑',
        price: 1499900,
        category_id: 3,
        image_url: 'https://example.com/macbook-pro.jpg',
        status: 1,
        stock_quantity: 7,
        spec_label: '512GB / 深空黑',
        spec_values_json: '{"capacity":"512GB","color":"深空黑"}',
        sort_order: 2,
        created_at: 1717010000,
        updated_at: 1717011000,
      },
      {
        id: 102,
        group_id: 10,
        name: 'MacBook Pro 14 英寸',
        description: '专业级笔记本电脑',
        price: 1699900,
        category_id: 3,
        image_url: 'https://example.com/macbook-pro-max.jpg',
        status: 1,
        stock_quantity: 3,
        spec_label: '1TB / 深空黑',
        spec_values_json: '{"capacity":"1TB","color":"深空黑"}',
        sort_order: 3,
        created_at: 1717010000,
        updated_at: 1717011000,
      },
    ],
    default_product_id: 101,
    group_medias: [
      {
        id: 9002,
        image_url: 'https://img.example.com/group-gallery-1.jpg',
        alt_text: 'group gallery 1',
        sort_order: 1,
        is_primary: false,
        binding_id: 8002,
        usage_type: 'gallery',
      },
      {
        id: 9003,
        image_url: 'https://img.example.com/group-gallery-2.jpg',
        alt_text: 'group gallery 2',
        sort_order: 2,
        is_primary: false,
        binding_id: 8003,
        usage_type: 'hero',
      },
    ],
    product_medias: [
      {
        id: 9001,
        image_url: 'https://img.example.com/product-primary.jpg',
        alt_text: 'product primary',
        sort_order: 1,
        is_primary: true,
        binding_id: 8101,
        usage_type: 'gallery',
      },
    ],
    resolved_medias: [
      {
        id: 9001,
        image_url: 'https://img.example.com/product-primary.jpg',
        alt_text: 'product primary',
        sort_order: 1,
        is_primary: true,
        binding_id: 8101,
        usage_type: 'gallery',
      },
      {
        id: 9002,
        image_url: 'https://img.example.com/group-gallery-1.jpg',
        alt_text: 'group gallery 1',
        sort_order: 2,
        is_primary: false,
        binding_id: 8002,
        usage_type: 'gallery',
      },
      {
        id: 9003,
        image_url: 'https://img.example.com/group-gallery-2.jpg',
        alt_text: 'group gallery 2',
        sort_order: 3,
        is_primary: false,
        binding_id: 8003,
        usage_type: 'hero',
      },
    ],
  });

  assert.equal(detail.product.group_id, 10);
  assert.equal(detail.group.id, 10);
  assert.equal(detail.group.cover_image_url, 'https://img.example.com/group-cover.jpg');
  assert.equal(detail.group.default_product_id, 101);
  assert.equal(detail.variants.length, 2);
  assert.equal(detail.variants[1]?.spec_label, '1TB / 深空黑');
  assert.equal(detail.default_product_id, 101);
  assert.equal(detail.group_medias.length, 2);
  assert.equal(detail.product_medias.length, 1);
  assert.equal(detail.resolved_medias.length, 3);
  assert.equal(detail.resolved_medias[0]?.image_url, 'https://img.example.com/product-primary.jpg');
  assert.equal(detail.group_medias[1]?.usage_type, 'hero');
});

test('normalizeProductListResponse 会按商品组聚合列表卡片，避免同款不同版本重复陈列', () => {
  const result = normalizeProductListResponse({
    items: [
      {
        id: 101,
        group_id: 10,
        name: 'MacBook Pro 14 英寸',
        description: '专业级笔记本电脑',
        price: 1499900,
        category_id: 3,
        image_url: 'https://example.com/macbook-pro-512.jpg',
        status: 1,
        spec_label: '512GB / 深空黑',
        spec_values_json: '{"capacity":"512GB","color":"深空黑"}',
        sort_order: 2,
        created_at: 1717010000,
        updated_at: 1717011000,
      },
      {
        id: 102,
        group_id: 10,
        name: 'MacBook Pro 14 英寸',
        description: '专业级笔记本电脑',
        price: 1699900,
        category_id: 3,
        image_url: 'https://example.com/macbook-pro-1tb.jpg',
        status: 1,
        spec_label: '1TB / 深空黑',
        spec_values_json: '{"capacity":"1TB","color":"深空黑"}',
        sort_order: 3,
        created_at: 1717010000,
        updated_at: 1717011000,
      },
      {
        id: 201,
        group_id: 20,
        name: 'iPhone Pro',
        description: '旗舰手机',
        price: 999900,
        category_id: 2,
        image_url: 'https://example.com/iphone-pro.jpg',
        status: 1,
        spec_label: '256GB / 原色',
        spec_values_json: '{"capacity":"256GB","color":"原色"}',
        sort_order: 1,
        created_at: 1717010000,
        updated_at: 1717011000,
      },
    ],
    total: 3,
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.id, 101);
  assert.equal(result.items[0]?.group_id, 10);
  assert.equal(result.items[1]?.id, 201);
  assert.equal(result.total, 2);
});

test('normalizeProductDetailResponse 在后端未返回 variants 时会回退为当前商品单版本', () => {
  const detail = normalizeProductDetailResponse({
    product: {
      id: 301,
      group_id: 30,
      name: 'iPad Air',
      description: '轻薄平板',
      price: 479900,
      category_id: 4,
      image_url: 'https://example.com/ipad-air.jpg',
      status: 1,
      stock_quantity: 12,
      spec_label: '128GB / 深空灰',
      spec_values_json: '{"capacity":"128GB","color":"深空灰"}',
      sort_order: 1,
      created_at: 1717010000,
      updated_at: 1717011000,
    },
    group: {
      id: 30,
      category_id: 4,
      name: 'iPad Air',
      hero_title: 'iPad Air',
      hero_subtitle: '轻薄平板',
      hero_image_url: 'https://example.com/ipad-air-hero.jpg',
      default_product_id: 301,
      status: 1,
      sort_order: 1,
    },
    variants: [],
    default_product_id: 301,
  });

  assert.equal(detail.variants.length, 1);
  assert.equal(detail.variants[0]?.id, 301);
  assert.equal(detail.variants[0]?.spec_label, '128GB / 深空灰');
  assert.equal(detail.default_product_id, 301);
});
