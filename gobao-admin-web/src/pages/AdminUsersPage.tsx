import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  changeAdminPassword,
  createAdminAccount,
  fetchAdminAccounts,
  updateAdminAccountPassword,
} from '../api/adminAuth';
import { useAdminAuth } from '../auth/useAdminAuth';
import { AdminToast } from '../components/AdminToast';
import {
  buildAdminToast,
  resolveAdminPasswordChangeErrorMessage,
  resolveApiErrorMessage,
  type AdminToastState,
} from '../lib/errors';
import type { AdminAccountSummary } from '../lib/types';

type RoleFilter = 'all' | 'super' | 'normal';

interface OwnPasswordForm {
  current_password: string;
  new_password: string;
}

interface CreateAdminForm {
  email: string;
  password: string;
  nickname: string;
  avatar_url: string;
  is_super_admin: boolean;
}

const EMPTY_OWN_PASSWORD_FORM: OwnPasswordForm = {
  current_password: '',
  new_password: '',
};

const EMPTY_CREATE_ADMIN_FORM: CreateAdminForm = {
  email: '',
  password: '',
  nickname: '',
  avatar_url: '',
  is_super_admin: false,
};

/**
 * 通过角色筛选判断账号是否应显示在当前列表中。
 * 搜索与角色过滤均在前端完成，避免为了纯展示状态反复请求后端。
 */
function matchRoleFilter(account: AdminAccountSummary, roleFilter: RoleFilter): boolean {
  if (roleFilter === 'super') {
    return account.is_super_admin;
  }
  if (roleFilter === 'normal') {
    return !account.is_super_admin;
  }
  return true;
}

/**
 * 后台账号管理页。
 * 页面面向后台管理员体系：普通管理员只管理自己的密码，超级管理员额外管理账号列表、创建账号与重置密码。
 */
export function AdminUsersPage() {
  const { admin, refreshAdmin } = useAdminAuth();
  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [passwordForm, setPasswordForm] = useState<OwnPasswordForm>(EMPTY_OWN_PASSWORD_FORM);
  const [createForm, setCreateForm] = useState<CreateAdminForm>(EMPTY_CREATE_ADMIN_FORM);
  const [resetPasswordByAdmin, setResetPasswordByAdmin] = useState<Record<number, string>>({});
  const [resettingAdminId, setResettingAdminId] = useState(0);
  const [expandedResetAdminId, setExpandedResetAdminId] = useState(0);
  const [submittingOwnPassword, setSubmittingOwnPassword] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [toast, setToast] = useState<AdminToastState | null>(null);

  /**
   * 只在超级管理员身份下拉取账号列表。
   * 普通后台账号无权查看其他账号，页面会直接进入自助改密模式。
   */
  async function loadAccounts() {
    setError('');
    if (!admin?.is_super_admin) {
      setAccounts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchAdminAccounts();
      setAccounts(response.items);
    } catch (cause) {
      setError(resolveApiErrorMessage(cause, '后台账号数据加载失败'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
    // 账号列表只受当前身份权限影响，筛选与搜索均为本地状态。
  }, [admin?.is_super_admin]);

  /**
   * 根据关键词与角色过滤生成当前表格行。
   * 关键词同时匹配昵称和邮箱，便于超管在少量账号中快速定位。
   */
  const visibleAccounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return accounts.filter((account) => {
      const matchesKeyword = normalizedKeyword
        ? `${account.nickname} ${account.email}`.toLowerCase().includes(normalizedKeyword)
        : true;
      return matchesKeyword && matchRoleFilter(account, roleFilter);
    });
  }, [accounts, keyword, roleFilter]);

  const superAdminCount = useMemo(() => accounts.filter((account) => account.is_super_admin).length, [accounts]);
  const normalAdminCount = Math.max(0, accounts.length - superAdminCount);

  /**
   * 当前后台账号自助修改密码。
   * 成功后刷新当前身份，确保顶部会话信息仍以后端为准。
   */
  async function handleChangeOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingOwnPassword(true);
    setError('');

    try {
      await changeAdminPassword(passwordForm);
      setPasswordForm(EMPTY_OWN_PASSWORD_FORM);
      setToast(buildAdminToast('success', '后台密码已修改'));
      await refreshAdmin();
    } catch (cause) {
      setToast(buildAdminToast('error', resolveAdminPasswordChangeErrorMessage(cause)));
    } finally {
      setSubmittingOwnPassword(false);
    }
  }

  /**
   * 超级管理员创建新的后台账号。
   * 新账号创建成功后直接并入当前列表，减少一次整页刷新。
   */
  async function handleCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingAdmin(true);
    setError('');

    try {
      const response = await createAdminAccount(createForm);
      setAccounts((current) => [...current, response.admin]);
      setCreateForm(EMPTY_CREATE_ADMIN_FORM);
      setToast(buildAdminToast('success', '后台账号已创建'));
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '创建后台账号失败')));
    } finally {
      setCreatingAdmin(false);
    }
  }

  /**
   * 超级管理员重置指定账号密码。
   * 当前账号不走此入口，避免把自助改密和超管重置两类语义混在一起。
   */
  async function handleResetAdminPassword(adminId: number) {
    const newPassword = resetPasswordByAdmin[adminId]?.trim();
    if (!newPassword) {
      setToast(buildAdminToast('warning', '请输入新的后台密码'));
      return;
    }

    setResettingAdminId(adminId);
    setError('');

    try {
      await updateAdminAccountPassword(adminId, { new_password: newPassword });
      setResetPasswordByAdmin((current) => ({ ...current, [adminId]: '' }));
      setExpandedResetAdminId(0);
      setToast(buildAdminToast('success', '后台账号密码已重置'));
    } catch (cause) {
      setToast(buildAdminToast('error', resolveApiErrorMessage(cause, '重置后台密码失败')));
    } finally {
      setResettingAdminId(0);
    }
  }

  if (!admin) {
    return (
      <section className="admin-panel">
        <div className="status status--error">当前没有可展示的后台账户信息，请先登录后台后再查看管理员页。</div>
      </section>
    );
  }

  return (
    <>
      <AdminToast toast={toast} onClose={() => setToast(null)} />

      <section className="admin-hero admin-hero--compact admin-account-hero">
        <div className="admin-hero__copy">
          <p className="admin-hero__eyebrow">账户管理</p>
          <h1>后台账号与权限</h1>
          <p>管理后台登录账号、超级管理员权限和密码维护入口。</p>
        </div>
        <div className="admin-hero__actions">
          <button className="admin-button admin-button--secondary" type="button" onClick={() => void refreshAdmin()}>
            刷新身份
          </button>
          {admin.is_super_admin ? (
            <button className="admin-button admin-button--primary" type="button" onClick={() => void loadAccounts()}>
              刷新列表
            </button>
          ) : null}
        </div>
      </section>

      <section className="admin-account-overview">
        <article className="admin-stat-card">
          <p>后台账号</p>
          <strong>{admin.is_super_admin ? accounts.length : '--'}</strong>
          <span>{admin.is_super_admin ? '当前可管理账号总数' : '普通账号不可查看总数'}</span>
        </article>
        <article className="admin-stat-card admin-stat-card--success">
          <p>超级管理员</p>
          <strong>{admin.is_super_admin ? superAdminCount : '--'}</strong>
          <span>拥有账号管理权限</span>
        </article>
        <article className="admin-stat-card">
          <p>普通管理员</p>
          <strong>{admin.is_super_admin ? normalAdminCount : '--'}</strong>
          <span>仅可维护自身密码</span>
        </article>
        <article className="admin-stat-card admin-stat-card--accent">
          <p>当前身份</p>
          <strong>{admin.is_super_admin ? '超管' : '普通'}</strong>
          <span>{admin.nickname || admin.email}</span>
        </article>
      </section>

      <section className="admin-account-layout">
        <div className="admin-panel admin-panel--dense admin-panel--wide">
          <div className="admin-panel__header admin-panel__header--stacked-mobile">
            <div>
              <p className="admin-panel__eyebrow">账号列表</p>
              <h2>后台管理员</h2>
            </div>
            <div className="admin-panel__meta">
              <span>显示 {visibleAccounts.length} 个</span>
              <span>全部 {accounts.length} 个</span>
            </div>
          </div>

          {!admin.is_super_admin ? (
            <div className="notice">当前账号为普通后台账号，只可管理自己的密码，不能查看或管理其他后台账号。</div>
          ) : null}

          {admin.is_super_admin ? (
            <>
              <div className="admin-account-toolbar">
                <label className="admin-filter-field admin-filter-field--wide">
                  <span>搜索</span>
                  <input
                    type="search"
                    value={keyword}
                    placeholder="按昵称或邮箱搜索"
                    onChange={(event) => setKeyword(event.target.value)}
                  />
                </label>
                <label className="admin-filter-field">
                  <span>权限</span>
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}>
                    <option value="all">全部账号</option>
                    <option value="super">超级管理员</option>
                    <option value="normal">普通管理员</option>
                  </select>
                </label>
              </div>

              {loading ? <div className="loading">正在加载后台账号数据...</div> : null}
              {!loading && error ? <div className="status status--error">{error}</div> : null}

              {!loading ? (
                <div className="admin-table-wrap admin-table-wrap--dense">
                  <table className="admin-table admin-table--dense admin-account-table">
                    <thead>
                      <tr>
                        <th>管理员</th>
                        <th>邮箱</th>
                        <th>权限</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAccounts.map((item) => (
                        <tr key={item.admin_id}>
                          <td>
                            <div className="admin-account-cell">
                              <div>
                                <strong>{item.nickname || '未设置昵称'}</strong>
                                <span>{admin.admin_id === item.admin_id ? '当前登录账号' : `编号 ${item.admin_id}`}</span>
                              </div>
                            </div>
                          </td>
                          <td>{item.email}</td>
                          <td>
                            <span className={`admin-badge${item.is_super_admin ? ' admin-badge--success' : ''}`}>
                              {item.is_super_admin ? '超级管理员' : '普通管理员'}
                            </span>
                          </td>
                          <td>
                            {admin.admin_id === item.admin_id ? (
                              <span className="admin-account-note">请在右侧修改自己的密码</span>
                            ) : (
                              <div className="admin-account-reset">
                                <button
                                  className="admin-button admin-button--secondary admin-button--small"
                                  type="button"
                                  onClick={() =>
                                    setExpandedResetAdminId((current) => (current === item.admin_id ? 0 : item.admin_id))
                                  }
                                >
                                  {expandedResetAdminId === item.admin_id ? '收起' : '重置密码'}
                                </button>
                                {expandedResetAdminId === item.admin_id ? (
                                  <div className="admin-account-reset__form">
                                    <input
                                      type="password"
                                      placeholder="输入新密码"
                                      value={resetPasswordByAdmin[item.admin_id] ?? ''}
                                      onChange={(event) =>
                                        setResetPasswordByAdmin((current) => ({
                                          ...current,
                                          [item.admin_id]: event.target.value,
                                        }))
                                      }
                                    />
                                    <button
                                      className="admin-button admin-button--primary admin-button--small"
                                      type="button"
                                      disabled={resettingAdminId === item.admin_id}
                                      onClick={() => void handleResetAdminPassword(item.admin_id)}
                                    >
                                      {resettingAdminId === item.admin_id ? '提交中' : '确认'}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!visibleAccounts.length ? (
                        <tr>
                          <td colSpan={4}>
                            <div className="notice">当前筛选条件下没有后台账号。</div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="admin-account-side">
          <section className="admin-panel admin-panel--dense">
            <div className="admin-panel__header">
              <div>
                <p className="admin-panel__eyebrow">当前账号</p>
                <h2>自助改密</h2>
              </div>
            </div>

            <div className="admin-account-current">
              <div>
                <strong>{admin.nickname || '未设置昵称'}</strong>
                <span>{admin.email}</span>
                <span>{admin.is_super_admin ? '超级管理员' : '普通后台账号'}</span>
              </div>
            </div>

            <form className="admin-form-grid admin-form-grid--single" onSubmit={handleChangeOwnPassword}>
              <label className="admin-field">
                <span>当前密码</span>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                  required
                />
              </label>
              <label className="admin-field">
                <span>新密码</span>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, new_password: event.target.value }))}
                  required
                />
              </label>
              <button className="admin-button admin-button--primary" type="submit" disabled={submittingOwnPassword}>
                {submittingOwnPassword ? '提交中' : '修改密码'}
              </button>
            </form>
          </section>

          {admin.is_super_admin ? (
            <section className="admin-panel admin-panel--dense">
              <div className="admin-panel__header">
                <div>
                  <p className="admin-panel__eyebrow">超级管理员</p>
                  <h2>创建账号</h2>
                </div>
              </div>

              <form className="admin-form-grid admin-form-grid--single" onSubmit={handleCreateAdmin}>
                <label className="admin-field">
                  <span>邮箱</span>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>昵称</span>
                  <input
                    type="text"
                    value={createForm.nickname}
                    onChange={(event) => setCreateForm((current) => ({ ...current, nickname: event.target.value }))}
                    required
                  />
                </label>
                <label className="admin-field">
                  <span>初始密码</span>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                    required
                  />
                </label>
                <label className="admin-checkbox admin-account-checkbox">
                  <input
                    type="checkbox"
                    checked={createForm.is_super_admin}
                    onChange={(event) => setCreateForm((current) => ({ ...current, is_super_admin: event.target.checked }))}
                  />
                  <span>授予超级管理员权限</span>
                </label>
                <button className="admin-button admin-button--primary" type="submit" disabled={creatingAdmin}>
                  {creatingAdmin ? '创建中' : '创建账号'}
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </section>
    </>
  );
}
