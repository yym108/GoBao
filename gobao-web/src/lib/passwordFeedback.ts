interface PasswordFieldErrors {
  code?: string;
  password?: string;
}

interface ApiErrorLike {
  status: number;
  backendMessage: string;
}

export const PASSWORD_CODE_SENT_NOTICE = '验证码已发送，请查看后端日志完成联调。';

export const PASSWORD_UPDATED_SUCCESS_NOTICE = '密码已更新，请使用新密码继续登录。';

function isApiErrorLike(cause: unknown): cause is ApiErrorLike {
  if (!cause || typeof cause !== 'object') {
    return false;
  }

  const candidate = cause as Record<string, unknown>;
  return typeof candidate.status === 'number' && typeof candidate.backendMessage === 'string';
}

/**
 * 统一生成修改密码场景的提示文案。
 * 本地校验失败时给出通用输入提示；后端返回明确业务原因时，优先展示该原因。
 */
export function resolvePasswordChangeNoticeMessage(cause?: unknown, fieldErrors?: PasswordFieldErrors): string {
  if (fieldErrors?.code || fieldErrors?.password) {
    return '修改密码失败，请检查输入后重试';
  }
  if (isApiErrorLike(cause)) {
    if (cause.backendMessage === 'new password must differ from current password') {
      return '新密码不能与旧密码相同';
    }
    if (cause.status === 404) {
      return '该邮箱尚未注册';
    }
    if (cause.status === 409) {
      return '验证码发送过于频繁，请稍后再试';
    }
    if (cause.status >= 500) {
      return '服务暂时不可用，请稍后重试';
    }
    return '账户操作失败，请稍后重试';
  }
  return '修改密码失败，请稍后重试';
}
