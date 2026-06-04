import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/useAdminAuth';

/**
 * 后台控制台导航定义。
 * 当前只暴露已经接入真实能力的模块入口。
 */
const adminNavItems = [
  { to: '.', label: '总览', end: true },
  { to: 'products', label: '商品管理', end: false },
  { to: 'orders', label: '订单中心', end: false },
  { to: 'users', label: '用户账户', end: false },
] as const;

/**
 * 后台共用壳层。
 * 这里统一承载左侧导航、阶段信息与右侧内容区，后续所有后台模块都在该壳层下扩展。
 */
export function AdminConsoleLayout() {
  const navigate = useNavigate();
  const { admin, logout } = useAdminAuth();

  /**
   * 后台退出后统一回到后台登录入口，避免跳回前台登录语义造成上下文切换。
   */
  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <aside className="admin-rail">
        <NavLink to="." end className="admin-rail__brand" aria-label="返回后台首页">
          <span className="admin-rail__brand-badge" aria-hidden="true" />
          <span>GoBao Console</span>
        </NavLink>

        <nav className="admin-rail__nav" aria-label="后台导航">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `admin-rail__link${isActive ? ' admin-rail__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-rail__footer">
          <div className="admin-rail__account">
            <div className="admin-rail__account-copy">
              <strong>{admin?.nickname || '后台账户'}</strong>
              <span>{admin?.email || '暂无邮箱'}</span>
              <span>{admin?.is_super_admin ? '超级管理员' : '普通后台账号'}</span>
            </div>
          </div>
          <button className="admin-button admin-button--ghost admin-button--rail" type="button" onClick={handleLogout}>
            退出后台
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
