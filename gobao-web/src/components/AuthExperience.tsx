import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { register, resetPasswordByEmail, sendForgotPasswordCode } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { resolveAuthErrorMessage } from '../lib/errors';
import { PASSWORD_CODE_SENT_NOTICE, PASSWORD_UPDATED_SUCCESS_NOTICE } from '../lib/passwordFeedback';

export type AuthMode = 'login' | 'register' | 'forgot-password';

interface AuthExperienceProps {
  initialMode?: AuthMode;
}

interface LoginRedirectState {
  from?: string;
  reason?: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  nickname?: string;
  code?: string;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateLoginForm(form: { email: string; password: string }): FormErrors {
  const errors: FormErrors = {};
  if (!form.email.trim() || !isValidEmail(form.email.trim())) {
    errors.email = '请输入正确的邮箱';
  }
  if (!form.password) {
    errors.password = '请输入密码';
  }
  return errors;
}

function validateRegisterForm(form: { email: string; password: string; nickname: string }): FormErrors {
  const errors = validateLoginForm(form);
  if (!form.nickname.trim()) {
    errors.nickname = '请输入昵称';
  } else if (form.nickname.trim().length < 2) {
    errors.nickname = '昵称至少 2 个字';
  } else if (form.nickname.trim().length > 20) {
    errors.nickname = '昵称不能超过 20 个字';
  }
  return errors;
}

function validateForgotPasswordForm(form: { email: string; code: string; new_password: string }): FormErrors {
  const errors: FormErrors = {};
  if (!form.email.trim() || !isValidEmail(form.email.trim())) {
    errors.email = '请输入正确的邮箱';
  }
  if (!/^\d{6}$/.test(form.code.trim())) {
    errors.code = '请输入 6 位验证码';
  }
  if (!form.new_password) {
    errors.password = '请输入新密码';
  } else if (form.new_password.length < 6) {
    errors.password = '密码至少 6 位';
  }
  return errors;
}

/**
 * AuthExperience 仅服务用户端前台应用。
 * 后台登录已拆分到独立的 gobao-admin-web，不再与此前台共享认证上下文。
 */
export function AuthExperience({ initialMode = 'login' }: AuthExperienceProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', nickname: '' });
  const [forgotPasswordForm, setForgotPasswordForm] = useState({ email: '', code: '', new_password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [countdown, setCountdown] = useState(0);
  const redirectState = (location.state as LoginRedirectState | null) ?? null;
  const [redirectNotice, setRedirectNotice] = useState(redirectState?.reason ?? '');
  const [redirectNoticeClosing, setRedirectNoticeClosing] = useState(false);

  useEffect(() => {
    if (!redirectState?.reason) {
      setRedirectNotice('');
      setRedirectNoticeClosing(false);
      return;
    }

    setRedirectNotice(redirectState.reason);
    setRedirectNoticeClosing(false);
    const hideTimer = window.setTimeout(() => {
      setRedirectNoticeClosing(true);
    }, 2600);
    const removeTimer = window.setTimeout(() => {
      setRedirectNotice('');
      setRedirectNoticeClosing(false);
    }, 3000);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, [redirectState?.reason]);

  const panelCopy = useMemo(
    () =>
      mode === 'login'
        ? {
            eyebrow: '账户登录',
            title: '欢迎回来。',
            submitLabel: submitting ? '登录中...' : '继续登录',
            switchHint: '还没有账号？',
            switchAction: '创建账户',
          }
        : {
            eyebrow: mode === 'register' ? '创建账户' : '找回密码',
            title: mode === 'register' ? '建立你的账户。' : '重置你的密码。',
            submitLabel: submitting ? '提交中...' : mode === 'register' ? '创建账户' : '确认重置',
            switchHint: mode === 'register' ? '已经有账号？' : '想起密码了？',
            switchAction: '返回登录',
          },
    [mode, submitting],
  );

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setSuccess('');
    setFieldErrors({});
  };

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const nextErrors = validateLoginForm(loginForm);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await login(loginForm);
      const redirectTo = redirectState?.from ?? '/profile';
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const nextErrors = validateRegisterForm(registerForm);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await register(registerForm);
      setLoginForm({ email: registerForm.email, password: '' });
      setRegisterForm({ email: '', password: '', nickname: '' });
      setFieldErrors({});
      setSuccess('注册成功，请继续登录。');
      setMode('login');
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'register'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendForgotPasswordCode() {
    setError('');
    setSuccess('');
    const email = forgotPasswordForm.email.trim();
    if (!email || !isValidEmail(email)) {
      setFieldErrors((current) => ({ ...current, email: '请输入正确的邮箱' }));
      return;
    }

    try {
      setCodeSubmitting(true);
      await sendForgotPasswordCode({ email });
      setCountdown(60);
      setSuccess(PASSWORD_CODE_SENT_NOTICE);
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setCodeSubmitting(false);
    }
  }

  async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const nextErrors = validateForgotPasswordForm(forgotPasswordForm);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await resetPasswordByEmail({
        email: forgotPasswordForm.email.trim(),
        code: forgotPasswordForm.code.trim(),
        new_password: forgotPasswordForm.new_password,
      });
      setLoginForm({ email: forgotPasswordForm.email.trim(), password: '' });
      setForgotPasswordForm({ email: '', code: '', new_password: '' });
      setFieldErrors({});
      setSuccess(PASSWORD_UPDATED_SUCCESS_NOTICE);
      setMode('login');
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'profile'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-experience">
        <div className="auth-experience__background" aria-hidden="true">
          <div className="auth-landscape">
            <div className="auth-landscape__glow auth-landscape__glow--left" />
            <div className="auth-landscape__glow auth-landscape__glow--right" />
            <div className="auth-landscape__line auth-landscape__line--one" />
            <div className="auth-landscape__line auth-landscape__line--two" />
            <div className="auth-landscape__line auth-landscape__line--three" />
          </div>
        </div>

        {redirectNotice ? <div className={`auth-floating-notice${redirectNoticeClosing ? ' auth-floating-notice--closing' : ''}`}>{redirectNotice}</div> : null}

        <section className="auth-experience__panel">
          <div className="auth-panel__card auth-panel__card--floating">
            <div className="auth-panel__header">
              <p className="auth-panel__eyebrow">{panelCopy.eyebrow}</p>
              <h2>{panelCopy.title}</h2>
            </div>

            {mode === 'login' ? (
              <form className="form auth-form" onSubmit={handleLoginSubmit}>
                <div className="field">
                  <label htmlFor="login-email">邮箱</label>
                  <input
                    id="login-email"
                    type="email"
                    value={loginForm.email}
                    onChange={(event) => {
                      const value = event.target.value;
                      setLoginForm((current) => ({ ...current, email: value }));
                      setFieldErrors((current) => ({ ...current, email: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                  {fieldErrors.email ? <div className="field__hint field__hint--error">{fieldErrors.email}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="login-password">密码</label>
                  <input
                    id="login-password"
                    type="password"
                    value={loginForm.password}
                    onChange={(event) => {
                      const value = event.target.value;
                      setLoginForm((current) => ({ ...current, password: value }));
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  {fieldErrors.password ? <div className="field__hint field__hint--error">{fieldErrors.password}</div> : null}
                </div>

                {error ? <div className="status status--error">{error}</div> : null}
                {success ? <div className="status status--success">{success}</div> : null}

                <button className="button button--primary auth-form__submit" type="submit" disabled={submitting}>
                  {panelCopy.submitLabel}
                </button>
              </form>
            ) : mode === 'register' ? (
              <form className="form auth-form" onSubmit={handleRegisterSubmit}>
                <div className="field">
                  <label htmlFor="register-nickname">昵称</label>
                  <input
                    id="register-nickname"
                    type="text"
                    value={registerForm.nickname}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRegisterForm((current) => ({ ...current, nickname: value }));
                      setFieldErrors((current) => ({ ...current, nickname: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.nickname)}
                    required
                  />
                  {fieldErrors.nickname ? <div className="field__hint field__hint--error">{fieldErrors.nickname}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="register-email">邮箱</label>
                  <input
                    id="register-email"
                    type="email"
                    value={registerForm.email}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRegisterForm((current) => ({ ...current, email: value }));
                      setFieldErrors((current) => ({ ...current, email: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                  {fieldErrors.email ? <div className="field__hint field__hint--error">{fieldErrors.email}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="register-password">密码</label>
                  <input
                    id="register-password"
                    type="password"
                    value={registerForm.password}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRegisterForm((current) => ({ ...current, password: value }));
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  {fieldErrors.password ? <div className="field__hint field__hint--error">{fieldErrors.password}</div> : null}
                </div>

                {error ? <div className="status status--error">{error}</div> : null}
                {success ? <div className="status status--success">{success}</div> : null}

                <button className="button button--primary auth-form__submit" type="submit" disabled={submitting}>
                  {panelCopy.submitLabel}
                </button>
              </form>
            ) : (
              <form className="form auth-form" onSubmit={handleForgotPasswordSubmit}>
                <div className="field">
                  <label htmlFor="forgot-email">邮箱</label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotPasswordForm.email}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForgotPasswordForm((current) => ({ ...current, email: value }));
                      setFieldErrors((current) => ({ ...current, email: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.email)}
                    required
                  />
                  {fieldErrors.email ? <div className="field__hint field__hint--error">{fieldErrors.email}</div> : null}
                </div>

                <div className="auth-form__inline-actions">
                  <button className="button button--secondary" type="button" onClick={handleSendForgotPasswordCode} disabled={codeSubmitting || countdown > 0}>
                    {codeSubmitting ? '发送中...' : countdown > 0 ? `${countdown}s 后可重发` : '发送验证码'}
                  </button>
                </div>

                <div className="field">
                  <label htmlFor="forgot-code">邮箱验证码</label>
                  <input
                    id="forgot-code"
                    type="text"
                    value={forgotPasswordForm.code}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForgotPasswordForm((current) => ({ ...current, code: value }));
                      setFieldErrors((current) => ({ ...current, code: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.code)}
                    required
                  />
                  {fieldErrors.code ? <div className="field__hint field__hint--error">{fieldErrors.code}</div> : null}
                </div>

                <div className="field">
                  <label htmlFor="forgot-password">新密码</label>
                  <input
                    id="forgot-password"
                    type="password"
                    value={forgotPasswordForm.new_password}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForgotPasswordForm((current) => ({ ...current, new_password: value }));
                      setFieldErrors((current) => ({ ...current, password: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.password)}
                    required
                  />
                  {fieldErrors.password ? <div className="field__hint field__hint--error">{fieldErrors.password}</div> : null}
                </div>

                {error ? <div className="status status--error">{error}</div> : null}
                {success ? <div className="status status--success">{success}</div> : null}

                <button className="button button--primary auth-form__submit" type="submit" disabled={submitting}>
                  {panelCopy.submitLabel}
                </button>
              </form>
            )}

            <div className="auth-panel__footer auth-panel__footer--stacked">
              <span className="small muted">{panelCopy.switchHint}</span>
              {mode === 'login' ? (
                <>
                  <button className="button button--ghost auth-panel__switch" type="button" onClick={() => switchMode('register')}>
                    创建账户
                  </button>
                  <button className="button button--ghost auth-panel__switch auth-panel__switch--subtle" type="button" onClick={() => switchMode('forgot-password')}>
                    找回密码
                  </button>
                </>
              ) : (
                <button className="button button--ghost auth-panel__switch" type="button" onClick={() => switchMode('login')}>
                  {panelCopy.switchAction}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
