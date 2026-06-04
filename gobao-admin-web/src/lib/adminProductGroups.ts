import type { Category, ProductGroup } from './types';

/**
 * 后台商品组列表行。
 * 在商品组原始字段上补充类目名称、状态文案与封面就绪标记，
 * 让一级列表无需再回查内部 ID 或重复推断展示口径。
 */
export interface AdminGroupRow extends ProductGroup {
  category_name: string;
  status_label: string;
  cover_ready: boolean;
}

/** 列表可点击排序的字段。 */
export type GroupSortKey = 'name' | 'sort_order' | 'status';

/** 排序方向。 */
export type SortDirection = 'asc' | 'desc';

/** 列表筛选条件。类目过滤走接口参数，这里只处理关键词与状态。 */
export interface GroupFilter {
  keyword: string;
  statusFilter: string;
}

/**
 * 将商品组状态码映射为后台列表文案。
 * 列表筛选与状态徽标共用同一套映射，避免显示口径不一致。
 */
export function resolveGroupStatusLabel(status: number): string {
  if (status === 1) {
    return '在售';
  }
  if (status === 2) {
    return '下架';
  }
  return '未知';
}

/**
 * 把类目编号转换成可读名称。
 * 一级列表按名称展示类目；0 表示当前商品组暂未归类。
 */
function resolveCategoryName(categories: Category[], categoryId: number): string {
  if (categoryId <= 0) {
    return '暂无类目';
  }
  return categories.find((item) => item.id === categoryId)?.name ?? `类目 ${categoryId}`;
}

/**
 * 基于商品组与类目快照构造后台一级列表行。
 * 一级页只展示系列层基本信息，版本、库存与媒体细节全部下沉到二级详情页。
 */
export function buildAdminGroupRows(groups: ProductGroup[], categories: Category[]): AdminGroupRow[] {
  return groups.map((group) => ({
    ...group,
    category_name: resolveCategoryName(categories, group.category_id),
    status_label: resolveGroupStatusLabel(group.status),
    cover_ready: Boolean(group.cover_image_url || group.hero_image_url),
  }));
}

/**
 * 统一做关键词匹配。
 * 关键词命中名称、slug、类目名与状态文案，便于运营用一个输入框快速检索。
 */
function matchesKeyword(row: AdminGroupRow, keyword: string): boolean {
  if (!keyword) {
    return true;
  }

  const haystack = [row.name, row.slug, row.category_name, row.status_label]
    .join(' ')
    .toLowerCase();

  return haystack.includes(keyword.toLowerCase());
}

/**
 * 按关键词与状态过滤商品组行。
 * 类目过滤交给接口的 category_id 参数完成，这里只处理本地可即时响应的两类条件。
 */
export function filterAdminGroupRows(rows: AdminGroupRow[], filter: GroupFilter): AdminGroupRow[] {
  const keyword = filter.keyword.trim();
  return rows.filter((row) => {
    if (!matchesKeyword(row, keyword)) {
      return false;
    }
    if (filter.statusFilter !== 'all' && String(row.status) !== filter.statusFilter) {
      return false;
    }
    return true;
  });
}

/**
 * 对当前页商品组行做本地排序。
 * 名称用本地化比较保证中英文顺序自然，数值字段按大小比较；始终返回新数组，不污染入参。
 */
export function sortAdminGroupRows(
  rows: AdminGroupRow[],
  sortKey: GroupSortKey,
  sortDir: SortDirection,
): AdminGroupRow[] {
  const factor = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sortKey === 'name') {
      return left.name.localeCompare(right.name) * factor;
    }
    const leftValue = sortKey === 'status' ? left.status : left.sort_order;
    const rightValue = sortKey === 'status' ? right.status : right.sort_order;
    return (leftValue - rightValue) * factor;
  });
}
