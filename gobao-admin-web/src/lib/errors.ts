export type AuthErrorScene = 'login' | 'register' | 'profile';

interface ApiErrorLike {
  status: number;
  backendMessage: string;
}

export interface AdminToastState {
  type: 'success' | 'error' | 'warning';
  message: string;
}

/**
 * 采用结构识别而不是 instanceof，避免不同模块实例或序列化对象导致错误提示退回通用文案。
 */
function isApiErrorLike(cause: unknown): cause is ApiErrorLike {
  if (!cause || typeof cause !== 'object') {
    return false;
  }

  const candidate = cause as Record<string, unknown>;
  return typeof candidate.status === 'number' && typeof candidate.backendMessage === 'string';
}

/**
 * 将后端返回的错误统一收口为前端自己的中文提示，避免原始报错直接暴露到界面。
 */
export function resolveApiErrorMessage(cause: unknown, fallback: string): string {
  if (!isApiErrorLike(cause)) {
    return fallback;
  }

  if (cause.status === 401) {
    return '请先登录后再继续操作';
  }
  if (cause.status === 403) {
    return '当前没有权限执行此操作';
  }
  if (cause.status === 404) {
    return '请求的内容不存在或已下线';
  }
  if (cause.status === 409) {
    return '当前操作与已有数据冲突，请刷新后重试';
  }
  if (cause.status === 412) {
    return '当前状态不支持继续该操作，请刷新后重试';
  }
  if (cause.status === 422) {
    return '提交的信息不符合要求，请检查后重试';
  }
  if (cause.status >= 500) {
    return '服务暂时不可用，请稍后重试';
  }

  return fallback;
}

/**
 * 后台自助改密使用专用提示。
 * 该接口里“当前密码错误”和“登录态失效”都可能是 401，必须结合后端 message 区分。
 */
export function resolveAdminPasswordChangeErrorMessage(cause: unknown): string {
  if (!isApiErrorLike(cause)) {
    return '修改后台密码失败';
  }

  if (cause.backendMessage === 'invalid current password') {
    return '当前密码错误';
  }
  if (cause.backendMessage === 'new password must be different from current password') {
    return '新密码不能与当前密码相同';
  }
  if (cause.backendMessage === 'password must be at least 5 characters') {
    return '新密码至少 5 位';
  }

  return resolveApiErrorMessage(cause, '修改后台密码失败');
}

/**
 * 登录与注册页使用更贴近账户场景的中文提示，不直接暴露后端细节。
 */
export function resolveAuthErrorMessage(cause: unknown, scene: AuthErrorScene): string {
  if (!isApiErrorLike(cause)) {
    if (scene === 'login') {
      return '登录失败，请稍后重试';
    }
    return '账户操作失败，请稍后重试';
  }

  if (scene === 'login' && cause.status === 401) {
    return '邮箱或密码错误';
  }
  if (scene === 'profile' && cause.backendMessage === 'new password must be different from current password') {
    return '新密码不能与旧密码相同';
  }

  if (scene === 'login') {
    return resolveApiErrorMessage(cause, '登录失败，请稍后重试');
  }
  return resolveApiErrorMessage(cause, '账户操作失败，请稍后重试');
}

/**
 * 构造后台顶部弹窗所需的消息对象。
 * 后台操作提示统一收口为顶部浮层，避免卡片内提示被当前滚动位置遮挡。
 */
export function buildAdminToast(type: AdminToastState['type'], message: string): AdminToastState {
  return { type, message };
}
