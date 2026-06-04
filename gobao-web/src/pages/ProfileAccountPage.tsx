import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { changePassword, fetchPasswordResetCode, fetchProfile, sendPasswordResetCode, updateProfile, uploadAvatar } from '../api/auth';
import { AvatarCropperModal } from '../components/AvatarCropperModal';
import { PageTitle } from '../components/PageTitle';
import { useAuth } from '../auth/useAuth';
import { resolveAuthErrorMessage } from '../lib/errors';
import {
  PASSWORD_CODE_SENT_NOTICE,
  PASSWORD_UPDATED_SUCCESS_NOTICE,
  resolvePasswordChangeNoticeMessage,
} from '../lib/passwordFeedback';

const EXPOSE_DEV_PASSWORD_CODE = import.meta.env.VITE_EXPOSE_DEV_PASSWORD_CODE === 'true';

function validateNickname(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed) {
    return '请输入昵称';
  }
  if (trimmed.length < 2) {
    return '昵称至少 2 个字';
  }
  if (trimmed.length > 20) {
    return '昵称不能超过 20 个字';
  }
  return '';
}

function validatePasswordForm(code: string, password: string): { code?: string; password?: string } {
  const errors: { code?: string; password?: string } = {};
  if (!/^\d{6}$/.test(code.trim())) {
    errors.code = '请输入 6 位验证码';
  }
  if (!password) {
    errors.password = '请输入新密码';
  } else if (password.length < 6) {
    errors.password = '密码至少 6 位';
  }
  return errors;
}

export function ProfileAccountPage() {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeVariant, setNoticeVariant] = useState<'success' | 'error'>('success');
  const [noticeClosing, setNoticeClosing] = useState(false);
  const [profileForm, setProfileForm] = useState({ nickname: '', avatar_url: '' });
  const [cropSrc, setCropSrc] = useState('');
  const [cropFileName, setCropFileName] = useState('');
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ code: '', new_password: '' });
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeFetching, setCodeFetching] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ nickname?: string; code?: string; password?: string }>({});
  const [countdown, setCountdown] = useState(0);

  function showNotice(message: string, variant: 'success' | 'error' = 'success') {
    setNoticeClosing(false);
    setNotice('');
    setNoticeVariant(variant);
    window.setTimeout(() => {
      setNotice(message);
    }, 0);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setUser(profile);
        setProfileForm({
          nickname: profile.nickname,
          avatar_url: profile.avatar_url ?? '',
        });
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(resolveAuthErrorMessage(cause, 'profile'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      setNoticeClosing(false);
      return;
    }

    setNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setNotice('');
      setNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [notice]);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  /**
   * 选择头像文件后打开裁剪弹窗。
   * 仅读取本地预览，不直接上传，避免误触发写操作。
   */
  function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setCropSrc(URL.createObjectURL(file));
    setCropFileName(file.name);
    // 允许再次选择同一文件
    event.target.value = '';
  }

  /**
   * 关闭裁剪弹窗并释放本地预览 URL。
   */
  function closeCropper() {
    if (cropSrc) {
      URL.revokeObjectURL(cropSrc);
    }
    setCropSrc('');
    setCropFileName('');
  }

  /**
   * 确认裁剪后上传头像。
   * 上传成功后由 user 服务回写并返回最新资料，这里直接覆盖本地用户态。
   */
  async function handleAvatarCropConfirm(base64: string, mimeType: string, fileName: string) {
    setError('');
    setNotice('');
    try {
      setAvatarSubmitting(true);
      const nextUser = await uploadAvatar({ file_name: fileName, mime_type: mimeType, content_base64: base64 });
      setUser(nextUser);
      setProfileForm((current) => ({ ...current, avatar_url: nextUser.avatar_url ?? '' }));
      closeCropper();
      showNotice('头像已更新。');
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setAvatarSubmitting(false);
    }
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const nicknameError = validateNickname(profileForm.nickname);
    setFieldError((current) => ({ ...current, nickname: nicknameError || undefined }));
    if (nicknameError) {
      return;
    }

    try {
      setProfileSubmitting(true);
      const nextUser = await updateProfile({
        nickname: profileForm.nickname.trim(),
        avatar_url: profileForm.avatar_url.trim(),
      });
      setUser(nextUser);
      setProfileForm({
        nickname: nextUser.nickname,
        avatar_url: nextUser.avatar_url ?? '',
      });
      showNotice('个人资料已更新。');
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleSendCode() {
    setError('');
    setNotice('');
    try {
      setCodeSubmitting(true);
      await sendPasswordResetCode();
      setCountdown(60);
      showNotice(PASSWORD_CODE_SENT_NOTICE);
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setCodeSubmitting(false);
    }
  }

  /**
   * 开发便利：读回当前验证码并自动填入输入框。
   * 仅在开发模式下提供入口；若后端未开启取码开关或验证码尚未发送，则提示。
   */
  async function handleFetchCode() {
    setError('');
    setNotice('');
    try {
      setCodeFetching(true);
      const { code } = await fetchPasswordResetCode();
      setPasswordForm((current) => ({ ...current, code }));
      setFieldError((current) => ({ ...current, code: undefined }));
      showNotice('已自动填入当前验证码（开发模式）。');
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setCodeFetching(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    const nextErrors = validatePasswordForm(passwordForm.code, passwordForm.new_password);
    setFieldError((current) => ({
      ...current,
      code: nextErrors.code,
      password: nextErrors.password,
    }));
    if (nextErrors.code || nextErrors.password) {
      showNotice(resolvePasswordChangeNoticeMessage(undefined, nextErrors), 'error');
      return;
    }

    try {
      setPasswordSubmitting(true);
      await changePassword({
        code: passwordForm.code.trim(),
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ code: '', new_password: '' });
      showNotice(PASSWORD_UPDATED_SUCCESS_NOTICE);
    } catch (cause) {
      setError('');
      showNotice(resolvePasswordChangeNoticeMessage(cause), 'error');
    } finally {
      setPasswordSubmitting(false);
    }
  }

  if (loading) {
    return <div className="loading">正在加载账户资料...</div>;
  }

  if (!user) {
    return <div className="status status--error">当前账户资料不可用，请重新登录。</div>;
  }

  return (
    <div className="page stack">
      {notice ? <div className={`page-floating-notice${noticeVariant === 'error' ? ' page-floating-notice--error' : ''}${noticeClosing ? ' page-floating-notice--closing' : ''}`}>{notice}</div> : null}
      {cropSrc ? (
        <AvatarCropperModal
          imageSrc={cropSrc}
          fileName={cropFileName}
          submitting={avatarSubmitting}
          onCancel={closeCropper}
          onConfirm={handleAvatarCropConfirm}
        />
      ) : null}
      <PageTitle title="账户中心" desc="管理你的头像、昵称与账户安全设置。" />

      <section className="session-grid">
        <article className="card card--strong stack">
          <div className="hero__eyebrow">基本资料</div>
          <div className="profile-hero__identity">
            <div
              aria-hidden="true"
              className="profile-hero__avatar"
              style={profileForm.avatar_url ? { backgroundImage: `url(${profileForm.avatar_url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            />
            <div className="profile-hero__copy">
              <h1>{user.nickname}</h1>
              <div className="muted">{user.email}</div>
              <label className="button button--ghost button--small avatar-upload-trigger">
                上传头像
                <input type="file" accept="image/*" onChange={handleAvatarFileChange} hidden />
              </label>
            </div>
          </div>

          <form className="form" onSubmit={handleProfileSubmit}>
            <div className="field">
              <label htmlFor="profile-nickname">昵称</label>
              <input
                id="profile-nickname"
                type="text"
                value={profileForm.nickname}
                onChange={(event) => {
                  const value = event.target.value;
                  setProfileForm((current) => ({ ...current, nickname: value }));
                  setFieldError((current) => ({ ...current, nickname: undefined }));
                }}
              />
              {fieldError.nickname ? <div className="field__hint field__hint--error">{fieldError.nickname}</div> : null}
            </div>

            {error ? <div className="status status--error">{error}</div> : null}

            <div className="inline-actions">
              <button className="button button--primary" type="submit" disabled={profileSubmitting}>
                {profileSubmitting ? '保存中...' : '保存资料'}
              </button>
              <Link to="/profile" className="button button--ghost">
                返回个人页
              </Link>
            </div>
          </form>
        </article>

        <article className="card stack">
          <div className="hero__eyebrow">账户安全</div>
          <div className="muted">修改密码前请先获取验证码，验证码将发送到你的邮箱 {user.email}。</div>

          <form className="form" onSubmit={handleChangePassword}>
            <div className="inline-actions">
              <button className="button button--secondary" type="button" onClick={handleSendCode} disabled={codeSubmitting || countdown > 0}>
                {codeSubmitting ? '发送中...' : countdown > 0 ? `${countdown}s 后可重发` : '发送验证码'}
              </button>
              {EXPOSE_DEV_PASSWORD_CODE ? (
                <button className="button button--ghost" type="button" onClick={handleFetchCode} disabled={codeFetching}>
                  {codeFetching ? '获取中...' : '获取验证码（开发）'}
                </button>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="profile-code">邮箱验证码</label>
              <input
                id="profile-code"
                type="text"
                value={passwordForm.code}
                onChange={(event) => {
                  const value = event.target.value;
                  setPasswordForm((current) => ({ ...current, code: value }));
                  setFieldError((current) => ({ ...current, code: undefined }));
                }}
              />
              {fieldError.code ? <div className="field__hint field__hint--error">{fieldError.code}</div> : null}
            </div>

            <div className="field">
              <label htmlFor="profile-new-password">新密码</label>
              <input
                id="profile-new-password"
                type="password"
                value={passwordForm.new_password}
                onChange={(event) => {
                  const value = event.target.value;
                  setPasswordForm((current) => ({ ...current, new_password: value }));
                  setFieldError((current) => ({ ...current, password: undefined }));
                }}
              />
              {fieldError.password ? <div className="field__hint field__hint--error">{fieldError.password}</div> : null}
            </div>

            <button className="button button--primary" type="submit" disabled={passwordSubmitting}>
              {passwordSubmitting ? '提交中...' : '修改密码'}
            </button>
          </form>
        </article>
      </section>
    </div>
  );
}
