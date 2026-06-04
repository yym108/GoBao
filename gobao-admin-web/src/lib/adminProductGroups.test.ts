import { describe, expect, it } from 'vitest';
import {
  buildAdminGroupRows,
  filterAdminGroupRows,
  resolveGroupStatusLabel,
  sortAdminGroupRows,
} from './adminProductGroups';
import type { Category, ProductGroup } from './types';

/**
 * 构造一个最小可用的商品组测试数据，
 * 仅覆盖列表纯逻辑关心的字段，其余字段给安全默认值。
 */
function makeGroup(overrides: Partial<ProductGroup> = {}): ProductGroup {
  return {
    id: 1,
    name: 'MacBook Air',
    slug: 'macbook-air',
    hero_title: '',
    hero_subtitle: '',
    hero_image_url: '',
    cover_image_url: '',
    category_id: 2,
    status: 1,
    sort_order: 1,
    spec_keys: [],
    ...overrides,
  };
}

const categories: Category[] = [
  { id: 2, name: '数码', sort_order: 1, created_at: 0, updated_at: 0 },
  { id: 3, name: '配件', sort_order: 2, created_at: 0, updated_at: 0 },
];

describe('resolveGroupStatusLabel', () => {
  it('把状态 1 映射为在售', () => {
    expect(resolveGroupStatusLabel(1)).toBe('在售');
  });

  it('把状态 2 映射为下架', () => {
    expect(resolveGroupStatusLabel(2)).toBe('下架');
  });

  it('把未知状态映射为未知', () => {
    expect(resolveGroupStatusLabel(99)).toBe('未知');
  });
});

describe('buildAdminGroupRows', () => {
  it('补全类目名称、状态文案与封面就绪标记', () => {
    const rows = buildAdminGroupRows(
      [makeGroup({ category_id: 2, status: 1, cover_image_url: '/media/cover.jpg' })],
      categories,
    );

    expect(rows[0].category_name).toBe('数码');
    expect(rows[0].status_label).toBe('在售');
    expect(rows[0].cover_ready).toBe(true);
  });

  it('封面与头图都缺失时 cover_ready 为 false', () => {
    const rows = buildAdminGroupRows(
      [makeGroup({ cover_image_url: '', hero_image_url: '' })],
      categories,
    );

    expect(rows[0].cover_ready).toBe(false);
  });

  it('封面缺失但有头图时也视为封面就绪', () => {
    const rows = buildAdminGroupRows(
      [makeGroup({ cover_image_url: '', hero_image_url: '/media/hero.jpg' })],
      categories,
    );

    expect(rows[0].cover_ready).toBe(true);
  });

  it('类目不存在时回退展示带 ID 的占位名称', () => {
    const rows = buildAdminGroupRows([makeGroup({ category_id: 999 })], categories);

    expect(rows[0].category_name).toBe('类目 999');
  });

  it('类目为空时展示暂无类目', () => {
    const rows = buildAdminGroupRows([makeGroup({ category_id: 0 })], categories);

    expect(rows[0].category_name).toBe('暂无类目');
  });
});

describe('filterAdminGroupRows', () => {
  const rows = buildAdminGroupRows(
    [
      makeGroup({ id: 1, name: 'MacBook Air', slug: 'macbook-air', status: 1 }),
      makeGroup({ id: 2, name: 'iPhone 15', slug: 'iphone-15', status: 2, category_id: 3 }),
    ],
    categories,
  );

  it('空关键词与全部状态时返回全部', () => {
    const result = filterAdminGroupRows(rows, { keyword: '', statusFilter: 'all' });
    expect(result).toHaveLength(2);
  });

  it('按名称关键词匹配且忽略大小写', () => {
    const result = filterAdminGroupRows(rows, { keyword: 'iphone', statusFilter: 'all' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('按 slug 命中关键词', () => {
    const result = filterAdminGroupRows(rows, { keyword: 'macbook-air', statusFilter: 'all' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('按状态过滤只保留对应状态', () => {
    const result = filterAdminGroupRows(rows, { keyword: '', statusFilter: '2' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('关键词与状态同时生效时取交集', () => {
    const result = filterAdminGroupRows(rows, { keyword: 'apple', statusFilter: '1' });
    expect(result).toHaveLength(0);
  });
});

describe('sortAdminGroupRows', () => {
  const rows = buildAdminGroupRows(
    [
      makeGroup({ id: 1, name: 'Beta', sort_order: 3, status: 2 }),
      makeGroup({ id: 2, name: 'Alpha', sort_order: 1, status: 1 }),
      makeGroup({ id: 3, name: 'Gamma', sort_order: 2, status: 1 }),
    ],
    categories,
  );

  it('按排序值升序排列', () => {
    const result = sortAdminGroupRows(rows, 'sort_order', 'asc');
    expect(result.map((row) => row.id)).toEqual([2, 3, 1]);
  });

  it('按排序值降序排列', () => {
    const result = sortAdminGroupRows(rows, 'sort_order', 'desc');
    expect(result.map((row) => row.id)).toEqual([1, 3, 2]);
  });

  it('按名称升序做本地化字符串比较', () => {
    const result = sortAdminGroupRows(rows, 'name', 'asc');
    expect(result.map((row) => row.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('不修改传入的原数组', () => {
    const snapshot = rows.map((row) => row.id);
    sortAdminGroupRows(rows, 'name', 'asc');
    expect(rows.map((row) => row.id)).toEqual(snapshot);
  });
});
