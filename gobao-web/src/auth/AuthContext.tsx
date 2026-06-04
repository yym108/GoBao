import { createContext, useEffect, useMemo, useState } from 'react';
import { fetchCurrentUser, login as loginApi } from '../api/auth';
import { clearStoredAuth, loadStoredAuth, saveStoredAuth } from '../lib/storage';
import type { AuthUser, LoginResponse } from '../lib/types';

interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: LoginResponse | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = loadStoredAuth();
    if (!stored) {
      setLoading(false);
      return;
    }

    setSession(stored.session);
    setUser(stored.user ?? null);

    fetchCurrentUser()
      .then((nextUser) => {
        setUser(nextUser);
        saveStoredAuth({ session: stored.session, user: nextUser });
      })
      .catch(() => {
        clearStoredAuth();
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(session?.access_token),
      async login(input) {
        const nextSession = await loginApi(input);
        setSession(nextSession);
        saveStoredAuth({ session: nextSession });
        const nextUser = await fetchCurrentUser();
        setUser(nextUser);
        saveStoredAuth({ session: nextSession, user: nextUser });
      },
      logout() {
        clearStoredAuth();
        setSession(null);
        setUser(null);
      },
      async refreshUser() {
        if (!session) {
          return;
        }
        const nextUser = await fetchCurrentUser();
        setUser(nextUser);
        saveStoredAuth({ session, user: nextUser });
      },
      setUser(nextUser) {
        setUser(nextUser);
        if (!session) {
          return;
        }
        if (nextUser) {
          saveStoredAuth({ session, user: nextUser });
          return;
        }
        saveStoredAuth({ session });
      },
    }),
    [loading, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
