import type { AuthUser, LoginResponse } from './types';

const AUTH_KEY = 'gobao-web-auth';

export interface StoredAuth {
  session: LoginResponse;
  user?: AuthUser;
}

export function loadStoredAuth(): StoredAuth | null {
  const raw = window.localStorage.getItem(AUTH_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAuth;
  } catch {
    window.localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

export function saveStoredAuth(value: StoredAuth): void {
  window.localStorage.setItem(AUTH_KEY, JSON.stringify(value));
}

export function clearStoredAuth(): void {
  window.localStorage.removeItem(AUTH_KEY);
}
