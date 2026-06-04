import { describe, expect, it } from 'vitest';
import {
  alignSpecValuesToKeys,
  deriveSpecLabel,
  formatCentsToYuan,
  parseSpecValuesToPairs,
  parseYuanToCents,
  serializeSpecPairs,
  serializeSpecValues,
} from './adminProductVariantForm';

describe('parseYuanToCents', () => {
  it('把整数元转换为分', () => {
    expect(parseYuanToCents('8999')).toBe(899900);
  });

  it('把两位小数元转换为分', () => {
    expect(parseYuanToCents('8999.00')).toBe(899900);
    expect(parseYuanToCents('8999.50')).toBe(899950);
  });

  it('对超过两位的小数四舍五入到分', () => {
    expect(parseYuanToCents('10.005')).toBe(1001);
  });

  it('空字符串与非法输入回退为 0', () => {
    expect(parseYuanToCents('')).toBe(0);
    expect(parseYuanToCents('abc')).toBe(0);
  });

  it('负数价格被收口为 0', () => {
    expect(parseYuanToCents('-5')).toBe(0);
  });
});

describe('formatCentsToYuan', () => {
  it('把分格式化为两位小数元', () => {
    expect(formatCentsToYuan(899900)).toBe('8999.00');
    expect(formatCentsToYuan(899950)).toBe('8999.50');
  });

  it('0 分格式化为 0.00', () => {
    expect(formatCentsToYuan(0)).toBe('0.00');
  });
});

describe('parseSpecValuesToPairs', () => {
  it('把规格 JSON 对象解析为键值对数组', () => {
    expect(parseSpecValuesToPairs('{"ram":"16GB","storage":"512GB"}')).toEqual([
      { key: 'ram', value: '16GB' },
      { key: 'storage', value: '512GB' },
    ]);
  });

  it('把非字符串值统一转换为字符串', () => {
    expect(parseSpecValuesToPairs('{"count":3}')).toEqual([{ key: 'count', value: '3' }]);
  });

  it('空对象与空字符串返回空数组', () => {
    expect(parseSpecValuesToPairs('{}')).toEqual([]);
    expect(parseSpecValuesToPairs('')).toEqual([]);
  });

  it('非法 JSON 或非对象返回空数组', () => {
    expect(parseSpecValuesToPairs('not-json')).toEqual([]);
    expect(parseSpecValuesToPairs('[1,2]')).toEqual([]);
  });
});

describe('serializeSpecPairs', () => {
  it('把键值对数组序列化为 JSON 字符串', () => {
    expect(serializeSpecPairs([
      { key: 'ram', value: '16GB' },
      { key: 'storage', value: '512GB' },
    ])).toBe('{"ram":"16GB","storage":"512GB"}');
  });

  it('跳过键为空的行并对键值做修剪', () => {
    expect(serializeSpecPairs([
      { key: '  ram ', value: ' 16GB ' },
      { key: '', value: '忽略' },
    ])).toBe('{"ram":"16GB"}');
  });

  it('空数组序列化为空对象', () => {
    expect(serializeSpecPairs([])).toBe('{}');
  });
});

describe('alignSpecValuesToKeys', () => {
  it('按商品组维度顺序生成行，值从已有规格回填', () => {
    expect(alignSpecValuesToKeys(['芯片', '内存'], [
      { key: '芯片', value: 'M4' },
      { key: '存储', value: '512GB' },
    ])).toEqual([
      { key: '芯片', value: 'M4' },
      { key: '内存', value: '' },
    ]);
  });

  it('商品组没有定义维度时返回空数组', () => {
    expect(alignSpecValuesToKeys([], [{ key: '芯片', value: 'M4' }])).toEqual([]);
  });
});

describe('deriveSpecLabel', () => {
  it('按维度顺序用非空值拼出规格文案', () => {
    expect(deriveSpecLabel([
      { key: '芯片', value: 'M4' },
      { key: '内存', value: '16GB' },
      { key: '存储', value: '' },
    ])).toBe('M4 / 16GB');
  });

  it('全为空值时返回空字符串', () => {
    expect(deriveSpecLabel([{ key: '芯片', value: '' }])).toBe('');
  });
});

describe('serializeSpecValues', () => {
  it('修剪键值并跳过空值后序列化', () => {
    expect(serializeSpecValues([
      { key: '芯片', value: 'M4' },
      { key: '内存', value: '' },
      { key: ' 存储 ', value: ' 512GB ' },
    ])).toBe('{"芯片":"M4","存储":"512GB"}');
  });
});