import { describe, expect, it } from 'vitest';
import { resolveAdminPasswordChangeErrorMessage } from './errors';

describe('resolveAdminPasswordChangeErrorMessage', () => {
  it('把当前密码错误映射为后台改密专用提示', () => {
    const message = resolveAdminPasswordChangeErrorMessage({
      status: 401,
      backendMessage: 'invalid current password',
    });

    expect(message).toBe('当前密码错误');
  });

  it('保留真正登录态失效的通用提示', () => {
    const message = resolveAdminPasswordChangeErrorMessage({
      status: 401,
      backendMessage: 'invalid or expired token',
    });

    expect(message).toBe('请先登录后再继续操作');
  });
});
