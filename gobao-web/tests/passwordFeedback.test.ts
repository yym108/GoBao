import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_CODE_SENT_NOTICE,
  PASSWORD_UPDATED_SUCCESS_NOTICE,
  resolvePasswordChangeNoticeMessage,
} from '../src/lib/passwordFeedback.ts';

test('密码提示文案在不同流程间保持统一', () => {
  assert.equal(PASSWORD_CODE_SENT_NOTICE, '验证码已发送，请查看后端日志完成联调。');
  assert.equal(PASSWORD_UPDATED_SUCCESS_NOTICE, '密码已更新，请使用新密码继续登录。');
});

test('新旧密码相同时返回专属提示', () => {
  const message = resolvePasswordChangeNoticeMessage({
    status: 400,
    backendMessage: 'new password must differ from current password',
  });

  assert.equal(message, '新密码不能与旧密码相同');
});

test('本地校验失败时返回通用输入提示', () => {
  const message = resolvePasswordChangeNoticeMessage(undefined, {
    password: '密码至少 6 位',
  });

  assert.equal(message, '修改密码失败，请检查输入后重试');
});
