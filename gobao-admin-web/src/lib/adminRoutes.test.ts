import { describe, expect, it } from 'vitest';
import { productGroupPath, productVariantPath, productsPath } from './adminRoutes';

describe('admin 商品路由路径', () => {
  it('商品列表为绝对路径', () => {
    expect(productsPath()).toBe('/products');
  });

  it('商品组页带商品组 ID 的绝对路径', () => {
    expect(productGroupPath(5001)).toBe('/products/groups/5001');
  });

  it('子商品三级页带商品组与子商品 ID 的绝对路径', () => {
    expect(productVariantPath(5001, 1001002)).toBe('/products/groups/5001/variants/1001002');
  });
});
