import type { ProductDetail, ProductListItem, ProductVariant } from './types.ts';

const PRODUCT_STATUS_ON_SALE = 1;

type ProductAvailabilitySource = Pick<ProductListItem, 'status'> | Pick<ProductDetail, 'status' | 'stock_quantity'> | Pick<ProductVariant, 'status' | 'stock_quantity'>;

/**
 * 判断当前商品或版本是否处于上架状态。
 * 约定 1=上架，其余状态均视为当前不可售，具体业务判断以后端状态枚举为准。
 */
export function isProductOnSale(product: ProductAvailabilitySource | null | undefined): boolean {
  return (product?.status ?? 0) === PRODUCT_STATUS_ON_SALE;
}

/**
 * 判断当前商品或版本是否允许用户直接购买。
 * 下架优先于库存判断，避免用户只能在点击购买时才发现商品不可售。
 */
export function isProductPurchasable(product: ProductAvailabilitySource | null | undefined): boolean {
  if (!product) {
    return false;
  }
  if (!isProductOnSale(product)) {
    return false;
  }
  if ('stock_quantity' in product) {
    return product.stock_quantity > 0;
  }
  return true;
}

/**
 * 将商品当前状态映射为面向用户的购买提示文案。
 * 用户端只展示简洁提示，不暴露后台状态码。
 */
export function resolveProductAvailabilityMessage(product: ProductAvailabilitySource | null | undefined): string {
  if (!product) {
    return '当前商品暂不可购买';
  }
  if (!isProductOnSale(product)) {
    return '当前商品暂时无法购买';
  }
  if ('stock_quantity' in product && product.stock_quantity <= 0) {
    return '当前暂时缺货';
  }
  return '当前可购买';
}
