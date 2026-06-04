import { apiRequest } from './client';
import type { AuthUser, LoginResponse } from '../lib/types';

export interface RegisterPayload {
  email: string;
  password: string;
  nickname: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export function register(payload: RegisterPayload): Promise<{ user_id: number }> {
  return apiRequest('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiRequest('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiRequest('/api/v1/profile', undefined, { auth: true });
}

export function pingWithAuth(): Promise<{ pong: boolean; user_id: number }> {
  return apiRequest('/api/v1/ping', undefined, { auth: true });
}

export interface UpdateProfilePayload {
  nickname: string;
  avatar_url: string;
}

export interface ChangePasswordPayload {
  code: string;
  new_password: string;
}

export interface ForgotPasswordCodePayload {
  email: string;
}

export interface ResetPasswordByEmailPayload {
  email: string;
  code: string;
  new_password: string;
}

export function fetchProfile(): Promise<AuthUser> {
  return fetchCurrentUser();
}

export function updateProfile(payload: UpdateProfilePayload): Promise<AuthUser> {
  return apiRequest('/api/v1/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export interface UploadAvatarPayload {
  file_name: string;
  mime_type: string;
  content_base64: string;
}

/**
 * 上传裁剪后的头像。
 * 由 user 服务存储文件并回写 avatar_url，成功后返回最新用户资料。
 */
export function uploadAvatar(payload: UploadAvatarPayload): Promise<AuthUser> {
  return apiRequest('/api/v1/profile/avatar', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

/**
 * 读取当前用户待用的改密验证码（仅开发/演示环境网关开启时可用）。
 * 验证码并未真正发邮件，这里直接从后端读回，便于本地联调。
 */
export function fetchPasswordResetCode(): Promise<{ code: string }> {
  return apiRequest('/api/v1/profile/password/code', undefined, { auth: true });
}

export function sendPasswordResetCode(): Promise<{ message: string }> {
  return apiRequest('/api/v1/profile/password/code', {
    method: 'POST',
  }, { auth: true });
}

export function changePassword(payload: ChangePasswordPayload): Promise<{ message: string }> {
  return apiRequest('/api/v1/profile/password/change', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { auth: true });
}

export function sendForgotPasswordCode(payload: ForgotPasswordCodePayload): Promise<{ message: string }> {
  return apiRequest('/api/v1/auth/password/code', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function resetPasswordByEmail(payload: ResetPasswordByEmailPayload): Promise<{ message: string }> {
  return apiRequest('/api/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
