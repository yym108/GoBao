/**
 * 首页首屏概览文案。
 */
export function resolveHomeHeroCopy(isAuthenticated: boolean): string {
  return isAuthenticated
    ? '你已经可以直接前往个人页、收藏和地址管理继续操作。'
    : '你可以先浏览商品，再登录继续订单、收藏和地址操作。';
}

/**
 * 收藏页说明文案。
 */
export function resolveFavoritesPanelCopy(): string {
  return '在这里集中管理你收藏的商品，随时查看、取消或继续选购。';
}
