import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { GuardedRoute } from '../components/GuardedRoute';
import { CartPage } from '../pages/CartPage';
import { AddressPage } from '../pages/AddressPage';
import { FavoritesPage } from '../pages/FavoritesPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OrdersPage } from '../pages/OrdersPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { ProfileAccountPage } from '../pages/ProfileAccountPage';
import { ProfilePage } from '../pages/ProfilePage';
import { RegisterPage } from '../pages/RegisterPage';
import { SessionPage } from '../pages/SessionPage';
import { ShopPage } from '../pages/ShopPage';
import { UnsupportedPage } from '../pages/UnsupportedPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/products" element={<ShopPage />} />
        <Route path="/products/:productId" element={<ProductDetailPage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route
          path="/profile"
          element={
            <GuardedRoute>
              <ProfilePage />
            </GuardedRoute>
          }
        />
        <Route
          path="/profile/addresses"
          element={
            <GuardedRoute>
              <AddressPage />
            </GuardedRoute>
          }
        />
        <Route
          path="/profile/account"
          element={
            <GuardedRoute>
              <ProfileAccountPage />
            </GuardedRoute>
          }
        />
        <Route
          path="/profile/orders"
          element={
            <GuardedRoute>
              <OrdersPage />
            </GuardedRoute>
          }
        />
        <Route
          path="/profile/favorites"
          element={
            <GuardedRoute>
              <FavoritesPage />
            </GuardedRoute>
          }
        />
        <Route path="/unsupported" element={<UnsupportedPage />} />
        <Route path="/me" element={<Navigate to="/profile" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
