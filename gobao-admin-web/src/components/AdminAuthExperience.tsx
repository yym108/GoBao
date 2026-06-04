import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/useAdminAuth';
import { resolveAuthErrorMessage } from '../lib/errors';

interface LoginRedirectState {
  from?: string;
  reason?: string;
}

interface FormErrors {
  email?: string;
  password?: string;
}

/**
 * 后台登录邮箱允许使用内部账号形式，例如 admin@admin。
 */
function isValidAdminLoginEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(email);
}

function validateLoginForm(form: { email: string; password: string }): FormErrors {
  const errors: FormErrors = {};
  if (!form.email.trim() || !isValidAdminLoginEmail(form.email.trim())) {
    errors.email = '请输入正确的邮箱';
  }
  if (!form.password) {
    errors.password = '请输入密码';
  }
  return errors;
}

/**
 * AdminAuthExperience 承载后台独立前端的登录体验。
 * 后台不复用前台注册与找回密码逻辑，避免应用间继续耦合。
 */
export function AdminAuthExperience() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAdminAuth();
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
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

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const nextErrors = validateLoginForm(loginForm);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await login(loginForm);
      const redirectTo = redirectState?.from ?? '/';
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(resolveAuthErrorMessage(cause, 'login'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page auth-page--admin">
      <div className="auth-experience auth-experience--admin">
        <div className="auth-experience__background" aria-hidden="true">
          <div className="auth-landscape auth-landscape--admin">
            <div className="auth-landscape__glow auth-landscape__glow--left" />
            <div className="auth-landscape__glow auth-landscape__glow--right" />
            <div className="auth-landscape__line auth-landscape__line--one" />
            <div className="auth-landscape__line auth-landscape__line--two" />
            <div className="auth-landscape__line auth-landscape__line--three" />
          </div>
        </div>

        {redirectNotice ? <div className={`auth-floating-notice${redirectNoticeClosing ? ' auth-floating-notice--closing' : ''}`}>{redirectNotice}</div> : null}

        <section className="auth-experience__panel">
          <div className="auth-panel__card auth-panel__card--floating auth-panel__card--admin">
            <div className="auth-panel__header">
              <p className="auth-panel__eyebrow">后台登录</p>
              <h2>进入 GoBao 后台控制台。</h2>
            </div>

            <form className="form auth-form" onSubmit={handleLoginSubmit}>
              <div className="field">
                <label htmlFor="admin-login-email">邮箱</label>
                <input
                  id="admin-login-email"
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
                <label htmlFor="admin-login-password">密码</label>
                <input
                  id="admin-login-password"
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

              <button className="button button--primary auth-form__submit" type="submit" disabled={submitting}>
                {submitting ? '登录中...' : '继续登录'}
              </button>
            </form>

            <div className="auth-panel__footer auth-panel__footer--stacked">
              <span className="small muted">仅已创建的后台账号可登录</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
