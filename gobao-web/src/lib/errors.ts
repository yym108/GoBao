export type AuthErrorScene = 'login' | 'register' | 'profile';

interface ApiErrorLike {
  status: number;
  backendMessage: string;
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
 * 登录与注册页使用更贴近账户场景的中文提示，不直接暴露后端细节。
 */
export function resolveAuthErrorMessage(cause: unknown, scene: AuthErrorScene): string {
  if (!isApiErrorLike(cause)) {
    if (scene === 'login') {
      return '登录失败，请稍后重试';
    }
    if (scene === 'register') {
      return '注册失败，请稍后重试';
    }
    return '账户操作失败，请稍后重试';
  }

  if (scene === 'register' && cause.status === 409) {
    return '该邮箱已注册';
  }
  if (scene === 'login' && cause.status === 401) {
    return '邮箱或密码错误';
  }
  if (scene === 'profile' && cause.backendMessage === 'new password must differ from current password') {
    return '新密码不能与旧密码相同';
  }
  if (scene === 'profile' && cause.status === 404) {
    return '该邮箱尚未注册';
  }
  if (scene === 'profile' && cause.status === 409) {
    return '验证码发送过于频繁，请稍后再试';
  }

  if (scene === 'login') {
    return resolveApiErrorMessage(cause, '登录失败，请稍后重试');
  }
  if (scene === 'register') {
    return resolveApiErrorMessage(cause, '注册失败，请稍后重试');
  }
  return resolveApiErrorMessage(cause, '账户操作失败，请稍后重试');
}
