import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminGuardedRoute } from '../components/AdminGuardedRoute';
import { AdminConsoleLayout } from '../components/AdminConsoleLayout';
import { AdminConsolePage } from '../pages/AdminConsolePage';
import { AdminProductDetailPage } from '../pages/AdminProductDetailPage';
import { AdminProductVariantDetailPage } from '../pages/AdminProductVariantDetailPage';
import { AdminLoginPage } from '../pages/AdminLoginPage';
import { AdminOrdersPage } from '../pages/AdminOrdersPage';
import { AdminProductsPage } from '../pages/AdminProductsPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';

/**
 * App 定义后台独立前端的完整路由树。
 * 后台应用只承载管理员相关页面，不再与用户端前端共享同一进程。
 */
export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AdminGuardedRoute loginPath="login">
            <AdminConsoleLayout />
          </AdminGuardedRoute>
        }
      >
        <Route index element={<AdminConsolePage />} />
        <Route path="products" element={<AdminProductsPage />} />
        <Route path="products/groups/:groupId" element={<AdminProductDetailPage />} />
        <Route path="products/groups/:groupId/variants/:productId" element={<AdminProductVariantDetailPage />} />
        <Route path="media" element={<Navigate to="products" replace />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="users" element={<AdminUsersPage />} />
      </Route>
      <Route path="login" element={<AdminLoginPage />} />
      <Route path="*" element={<Navigate to="." replace />} />
    </Routes>
  );
}
