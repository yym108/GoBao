/**
 * 将个人中心的关键计数收敛为一行概览文案。
 * 这里只做展示文案拼装，不参与任何业务推导。
 */
export function resolveProfileSummary(params: {
  orderCount: number;
  favoriteCount: number;
  addressCount: number;
}): string {
  if (params.orderCount <= 0 && params.favoriteCount <= 0 && params.addressCount <= 0) {
    return '当前还没有订单、收藏或地址记录。';
  }

  return `当前共有 ${params.orderCount} 笔订单、${params.favoriteCount} 件收藏、${params.addressCount} 条地址。`;
}

/** 个人中心入口卡可展示计数的维度，null 表示该入口无计数。 */
export type ProfileEntryMetric = 'orders' | 'favorites' | 'addresses' | null;

/**
 * 解析单个入口卡右下角的计数文案。
 * 让数量直接落到对应入口，而不是只汇总在顶部一句概览里；无计数维度则回退为进入提示。
 */
export function resolveEntryCountLabel(
  summary: { orderCount: number; favoriteCount: number; addressCount: number },
  metric: ProfileEntryMetric,
): string {
  if (metric === 'orders') {
    return `${summary.orderCount} 笔`;
  }
  if (metric === 'favorites') {
    return `${summary.favoriteCount} 件`;
  }
  if (metric === 'addresses') {
    return `${summary.addressCount} 个`;
  }
  return '进入';
}
