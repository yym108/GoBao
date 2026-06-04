import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

interface GuardedRouteProps {
  children: ReactElement;
  loginPath?: string;
}

export function GuardedRoute({ children, loginPath = '/login' }: GuardedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading">正在恢复登录态...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  return children;
}
