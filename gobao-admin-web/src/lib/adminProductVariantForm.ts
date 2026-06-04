/**
 * 规格键值对。
 * 用于把面向开发的规格 JSON 转换成面向普通运营的「属性名 / 属性值」成对输入。
 */
export interface SpecPair {
  key: string;
  value: string;
}

/**
 * 把以「元」录入的价格字符串转换为后端使用的「分」。
 * 支持整数与小数元，超过两位的小数四舍五入到分；非法输入与负数统一收口为 0。
 */
export function parseYuanToCents(input: string): number {
  const yuan = Number(input.trim());
  if (!Number.isFinite(yuan) || yuan <= 0) {
    return 0;
  }
  return Math.round(yuan * 100);
}

/**
 * 把后端的「分」格式化为两位小数的「元」字符串，供价格输入框回填与展示。
 */
export function formatCentsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * 把规格 JSON 解析为键值对数组。
 * 仅接受 JSON 对象，非法 JSON、非对象或空值统一回退为空数组；
 * 非字符串值统一转换为字符串，保证编辑器始终展示文本。
 */
export function parseSpecValuesToPairs(json: string): SpecPair[] {
  const trimmed = json.trim();
  if (!trimmed) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return [];
  }

  return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

/**
 * 把键值对数组序列化为规格 JSON 字符串。
 * 跳过键为空的行，并对键值做修剪；空数组序列化为空对象，避免写入非法 JSON。
 */
export function serializeSpecPairs(pairs: SpecPair[]): string {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) {
      continue;
    }
    result[key] = pair.value.trim();
  }
  return JSON.stringify(result);
}

/**
 * 按商品组定义的规格维度顺序生成可编辑行。
 * 维度名固定来自商品组，值从子商品已有规格按键回填，缺失的维度值留空，
 * 子商品多余的旧键不再展示，确保「维度由商品组定义，子商品只填值」。
 */
export function alignSpecValuesToKeys(keys: string[], existing: SpecPair[]): SpecPair[] {
  return keys.map((key) => ({
    key,
    value: existing.find((pair) => pair.key === key)?.value ?? '',
  }));
}

/**
 * 按维度顺序用非空值拼出面向顾客的规格文案。
 * 例如内存 16GB、存储 512GB 拼成 "16GB / 512GB"，空值维度被跳过。
 */
export function deriveSpecLabel(rows: SpecPair[]): string {
  return rows
    .map((row) => row.value.trim())
    .filter((value) => value.length > 0)
    .join(' / ');
}

/**
 * 将规格值行序列化为规格 JSON，修剪键值并跳过空值，避免写入无意义的空维度。
 */
export function serializeSpecValues(rows: SpecPair[]): string {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) {
      continue;
    }
    result[key] = value;
  }
  return JSON.stringify(result);
}
