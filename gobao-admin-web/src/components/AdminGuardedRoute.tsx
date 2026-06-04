import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../auth/useAdminAuth';

interface AdminGuardedRouteProps {
  children: ReactElement;
  loginPath?: string;
}

export function AdminGuardedRoute({ children, loginPath = '/login' }: AdminGuardedRouteProps) {
  const { isAuthenticated, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading">正在恢复后台登录态...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  return children;
}
