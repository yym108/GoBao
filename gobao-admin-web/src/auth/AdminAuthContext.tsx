import { createContext, useEffect, useMemo, useState } from 'react';
import { adminLogin, fetchCurrentAdmin } from '../api/adminAuth';
import { clearStoredAdminAuth, loadStoredAdminAuth, saveStoredAdminAuth } from '../lib/adminStorage';
import type { AdminProfile, AdminSessionResponse } from '../lib/types';

interface AdminLoginInput {
  email: string;
  password: string;
}

interface AdminAuthContextValue {
  admin: AdminProfile | null;
  session: AdminSessionResponse | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (input: AdminLoginInput) => Promise<void>;
  logout: () => void;
  refreshAdmin: () => Promise<void>;
}

export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredAdminAuth();
    if (!stored) {
      setLoading(false);
      return;
    }

    setSession(stored.session);
    setAdmin(stored.admin ?? null);

    fetchCurrentAdmin()
      .then((nextAdmin) => {
        setAdmin(nextAdmin);
        saveStoredAdminAuth({ session: stored.session, admin: nextAdmin });
      })
      .catch(() => {
        clearStoredAdminAuth();
        setSession(null);
        setAdmin(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      admin,
      session,
      loading,
      isAuthenticated: Boolean(session?.access_token),
      async login(input) {
        const nextSession = await adminLogin(input);
        setSession(nextSession);
        saveStoredAdminAuth({ session: nextSession });
        const nextAdmin = await fetchCurrentAdmin();
        setAdmin(nextAdmin);
        saveStoredAdminAuth({ session: nextSession, admin: nextAdmin });
      },
      logout() {
        clearStoredAdminAuth();
        setSession(null);
        setAdmin(null);
      },
      async refreshAdmin() {
        if (!session) {
          return;
        }
        const nextAdmin = await fetchCurrentAdmin();
        setAdmin(nextAdmin);
        saveStoredAdminAuth({ session, admin: nextAdmin });
      },
    }),
    [admin, loading, session],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
