import { useContext } from 'react';
import { AdminAuthContext } from './AdminAuthContext';

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth 必须在 AdminAuthProvider 内使用');
  }
  return context;
}
