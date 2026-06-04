import type { ProductVariant } from './types.ts';

export interface VariantSpecValueView {
  key: string;
  label: string;
  value: string;
  selected: boolean;
  selectable: boolean;
}

export interface VariantSpecGroupView {
  key: string;
  label: string;
  selected_value: string;
  values: VariantSpecValueView[];
}

type ParsedSpecMap = Record<string, string>;

/**
 * 将后端返回的规格 JSON 解析为键值对。
 * 解析失败时返回空对象，页面只降级展示，不中断商品详情渲染。
 */
export function parseVariantSpecValues(specValuesJSON: string): ParsedSpecMap {
  if (!specValuesJSON) {
    return {};
  }

  try {
    const parsed = JSON.parse(specValuesJSON) as Record<string, unknown>;
    return Object.entries(parsed).reduce<ParsedSpecMap>((result, [key, value]) => {
      if (typeof value === 'string' && value.trim()) {
        result[key] = value;
      }
      return result;
    }, {});
  } catch {
    return {};
  }
}

/**
 * 将规格字段 key 转换为更适合用户阅读的中文标题。
 * 当前先覆盖精品电子商品常见字段，其余字段退回原值。
 */
export function resolveVariantSpecLabel(key: string): string {
  switch (key) {
    case 'capacity':
      return '容量';
    case 'storage':
      return '存储';
    case 'memory':
      return '内存';
    case 'color':
      return '颜色';
    case 'finish':
      return '配色';
    case 'chip':
      return '芯片';
    case 'size':
      return '尺寸';
    default:
      return key;
  }
}

/**
 * 从所有子商品版本中降级推导规格维度。
 * 仅在商品组没有返回 spec_keys 的历史数据场景使用，正常情况下规格维度以商品组为准。
 */
function deriveSpecKeyOrderFromVariants(parsedMaps: Array<{ variant: ProductVariant; specMap: ParsedSpecMap }>): string[] {
  const keyOrder: string[] = [];
  for (const { specMap } of parsedMaps) {
    for (const key of Object.keys(specMap)) {
      if (!keyOrder.includes(key)) {
        keyOrder.push(key);
      }
    }
  }
  return keyOrder;
}

/**
 * 汇总同组独立商品版本的规格维度，并生成前端可直接渲染的规格组。
 * 规格维度优先使用商品组 spec_keys，使后台商品组配置与商城选配保持同一真值来源。
 */
export function buildVariantSpecGroups(variants: ProductVariant[], selectedVariantId: number, groupSpecKeys: string[] = []): VariantSpecGroupView[] {
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0] ?? null;
  if (!selectedVariant) {
    return [];
  }

  const parsedMaps = variants.map((variant) => ({
    variant,
    specMap: parseVariantSpecValues(variant.spec_values_json),
  }));
  const configuredKeyOrder = groupSpecKeys.map((key) => key.trim()).filter((key) => key.length > 0);
  const keyOrder = configuredKeyOrder.length > 0 ? configuredKeyOrder : deriveSpecKeyOrderFromVariants(parsedMaps);

  const selectedSpecMap = parseVariantSpecValues(selectedVariant.spec_values_json);

  return keyOrder.flatMap((key) => {
    const values = Array.from(
      new Set(
        parsedMaps
          .map(({ specMap }) => specMap[key])
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (values.length === 0) {
      return [];
    }

    return [{
      key,
      label: resolveVariantSpecLabel(key),
      selected_value: selectedSpecMap[key] ?? values[0] ?? '',
      values: values.map((value) => {
        const matchingVariant = parsedMaps.find(({ specMap }) => specMap[key] === value);
        return {
          key,
          label: resolveVariantSpecLabel(key),
          value,
          selected: selectedSpecMap[key] === value,
          selectable: Boolean(matchingVariant),
        };
      }),
    }];
  });
}

/**
 * 在同组版本中寻找与当前规格选择最匹配的独立商品。
 * 当前策略优先精确匹配全部规格，其次回退到匹配度最高的真实版本。
 */
export function findBestMatchingVariant({
  variants,
  selectedVariantId,
  specKey,
  specValue,
}: {
  variants: ProductVariant[];
  selectedVariantId: number;
  specKey: string;
  specValue: string;
}): ProductVariant | undefined {
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  if (!selectedVariant) {
    return undefined;
  }

  const selectedSpecMap = parseVariantSpecValues(selectedVariant.spec_values_json);
  const nextSpecMap: ParsedSpecMap = { ...selectedSpecMap, [specKey]: specValue };

  const exactMatch = variants.find((variant) => {
    const specMap = parseVariantSpecValues(variant.spec_values_json);
    return Object.entries(nextSpecMap).every(([key, value]) => specMap[key] === value);
  });
  if (exactMatch) {
    return exactMatch;
  }

  return [...variants]
    .filter((variant) => parseVariantSpecValues(variant.spec_values_json)[specKey] === specValue)
    .sort((left, right) => {
      const leftSpecMap = parseVariantSpecValues(left.spec_values_json);
      const rightSpecMap = parseVariantSpecValues(right.spec_values_json);

      const leftScore = Object.entries(nextSpecMap).reduce((score, [key, value]) => score + (leftSpecMap[key] === value ? 1 : 0), 0);
      const rightScore = Object.entries(nextSpecMap).reduce((score, [key, value]) => score + (rightSpecMap[key] === value ? 1 : 0), 0);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.id - right.id;
    })[0];
}
