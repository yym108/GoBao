interface ApiErrorLike {
  status: number;
  backendMessage: string;
}

function isApiErrorLike(cause: unknown): cause is ApiErrorLike {
  if (!cause || typeof cause !== 'object') {
    return false;
  }

  const candidate = cause as Record<string, unknown>;
  return typeof candidate.status === 'number' && typeof candidate.backendMessage === 'string';
}

/**
 * resolvePasswordChangeNoticeMessage 将后台返回的账户错误统一映射为中文提示。
 */
export function resolvePasswordChangeNoticeMessage(cause?: unknown): string {
  if (isApiErrorLike(cause)) {
    if (cause.backendMessage === 'new password must be different from current password') {
      return '新密码不能与旧密码相同';
    }
    if (cause.backendMessage === 'invalid current password' || cause.status === 401) {
      return '当前密码错误';
    }
    if (cause.status === 403) {
      return '当前没有权限执行此操作';
    }
    if (cause.status >= 500) {
      return '服务暂时不可用，请稍后重试';
    }
  }

  return '修改后台密码失败，请检查输入后重试';
}
