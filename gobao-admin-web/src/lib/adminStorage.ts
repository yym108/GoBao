import type { AdminProfile, AdminSessionResponse } from './types';

const ADMIN_AUTH_KEY = 'gobao-web-admin-auth';

export interface StoredAdminAuth {
  session: AdminSessionResponse;
  admin?: AdminProfile;
}

export function loadStoredAdminAuth(): StoredAdminAuth | null {
  const raw = window.localStorage.getItem(ADMIN_AUTH_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAdminAuth;
  } catch {
    window.localStorage.removeItem(ADMIN_AUTH_KEY);
    return null;
  }
}

export function saveStoredAdminAuth(value: StoredAdminAuth): void {
  window.localStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify(value));
}

export function clearStoredAdminAuth(): void {
  window.localStorage.removeItem(ADMIN_AUTH_KEY);
}
