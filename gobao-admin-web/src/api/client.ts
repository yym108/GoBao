import { clearStoredAdminAuth, loadStoredAdminAuth } from '../lib/adminStorage.ts';

export class ApiError extends Error {
  status: number;
  backendMessage: string;

  constructor(status: number, backendMessage: string) {
    super(`请求失败（${status}）`);
    this.name = 'ApiError';
    this.status = status;
    this.backendMessage = backendMessage;
  }
}

/**
 * 判断后台 401 是否代表登录态失效。
 * 自助改密接口会用 401 表示“当前密码错误”，这种业务校验失败不能清空后台登录态。
 */
function shouldClearAdminAuth(status: number, backendMessage: string): boolean {
  return status === 401 && backendMessage !== 'invalid current password';
}

function getBaseUrl(): string {
  const envValue = import.meta.env.VITE_GATEWAY_BASE_URL;
  // 优先使用显式注入的网关地址；未注入时回退到同源部署，避免浏览器错误请求访问者本机 localhost。
  return (envValue || '').replace(/\/$/, '');
}

function getAdminAuthToken(): string | null {
  return loadStoredAdminAuth()?.session.access_token ?? null;
}

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.message === 'string') {
      return data.message;
    }
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.code === 'string') {
      return data.code;
    }
  }

  const text = await response.text();
  return text || `请求失败（${response.status}）`;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { adminAuth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.adminAuth) {
    const token = getAdminAuthToken();
    if (!token) {
      throw new ApiError(401, '当前未登录后台，请先完成后台登录。');
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const message = await parseError(response);
    if (options.adminAuth && shouldClearAdminAuth(response.status, message)) {
      clearStoredAdminAuth();
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getConfiguredBaseUrl(): string {
  return getBaseUrl();
}
