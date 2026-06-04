import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAuthExperience } from '../components/AdminAuthExperience';
import { useAdminAuth } from '../auth/useAdminAuth';

/**
 * 后台登录页复用现有认证逻辑，但采用后台语义文案和后台登录后的默认跳转目标。
 */
export function AdminLoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAdminAuth();

  /**
   * 已登录状态访问后台登录页时直接回到后台首页，避免重复停留在登录表单。
   */
  useEffect(() => {
    if (loading) {
      return;
    }
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);

  return (
    <AdminAuthExperience />
  );
}
