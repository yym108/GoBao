import { apiRequest } from './client';
import type { AdminAccountSummary, AdminProfile, AdminSessionResponse } from '../lib/types';

export interface AdminLoginPayload {
  email: string;
  password: string;
}

export interface AdminChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface CreateAdminPayload {
  email: string;
  password: string;
  nickname: string;
  avatar_url: string;
  is_super_admin: boolean;
}

export interface UpdateAdminPasswordPayload {
  new_password: string;
}

export function adminLogin(payload: AdminLoginPayload): Promise<AdminSessionResponse> {
  return apiRequest('/api/v1/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchCurrentAdmin(): Promise<AdminProfile> {
  return apiRequest('/api/v1/admin/auth/me', undefined, { adminAuth: true });
}

export function changeAdminPassword(payload: AdminChangePasswordPayload): Promise<{ message: string }> {
  return apiRequest('/api/v1/admin/auth/password/change', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
}

export function fetchAdminAccounts(): Promise<{ items: AdminAccountSummary[] }> {
  return apiRequest('/api/v1/admin/accounts', undefined, { adminAuth: true });
}

export function createAdminAccount(payload: CreateAdminPayload): Promise<{ admin: AdminAccountSummary }> {
  return apiRequest('/api/v1/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
}

export function updateAdminAccountPassword(
  adminId: number,
  payload: UpdateAdminPasswordPayload,
): Promise<{ message: string }> {
  return apiRequest(`/api/v1/admin/accounts/${adminId}/password`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { adminAuth: true });
}
