/**
 * 后台商品相关路由的绝对路径构造。
 * 商品组页与子商品三级页是挂在布局根下的扁平路由，相对 `..` 回退会越过预期层级，
 * 因此页面统一改用这里的绝对路径跳转，避免误跳回首页或无匹配兜底。
 */

/** 商品（商品组）列表页路径。 */
export function productsPath(): string {
  return '/products';
}

/** 指定商品组的二级编辑页路径。 */
export function productGroupPath(groupId: number): string {
  return `/products/groups/${groupId}`;
}

/** 指定商品组下某个子商品的三级编辑页路径。 */
export function productVariantPath(groupId: number, productId: number): string {
  return `/products/groups/${groupId}/variants/${productId}`;
}
