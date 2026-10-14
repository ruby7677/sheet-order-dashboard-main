import { adminFetch } from './adminApi';
export interface AdminUser { id: string; username: string; email: string; full_name: string; role: string }
export type AdminSession = { kind: 'authenticated'; user: AdminUser } | { kind: 'expired' | 'forbidden' | 'unavailable'; code: string };

export async function checkAdminSession(signal?: AbortSignal): Promise<AdminSession> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) { abort(); }
  const timeout = window.setTimeout(abort, 12000);
  try {
    const response = await adminFetch('/auth/me', { signal: controller.signal, redirect: 'manual' });
    if (response.type === 'opaqueredirect' || response.status === 401) { return { kind: 'expired', code: 'ACCESS_LOGIN_REQUIRED' }; }
    if (response.status === 403) {
      const error = await response.clone().json().catch(() => null);
      return error?.code && error.code !== 'ADMIN_NOT_ALLOWED' ? { kind: 'unavailable', code: 'AUTH_CONFIGURATION_ERROR' } : { kind: 'forbidden', code: 'ADMIN_NOT_ALLOWED' };
    }
    if (!response.ok) { return { kind: 'unavailable', code: `HTTP_${response.status}` }; }
    if (!response.headers.get('Content-Type')?.includes('application/json')) { return { kind: 'unavailable', code: 'AUTH_RESPONSE_INVALID' }; }
    const data = await response.json();
    const user = data?.user;
    if (data?.success !== true || data?.logged_in !== true || !user || !['id', 'username', 'email', 'full_name', 'role'].every(key => typeof user[key] === 'string' && user[key].length > 0) || user.role !== 'admin') { return { kind: 'unavailable', code: 'AUTH_RESPONSE_INVALID' }; }
    return { kind: 'authenticated', user };
  } catch { return { kind: 'unavailable', code: controller.signal.aborted ? 'AUTH_TIMEOUT' : 'AUTH_NETWORK_ERROR' }; }
  finally { window.clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export function adminReturnPath(value: unknown): string {
  return typeof value === 'string' && ['/', '/manual-orders', '/products', '/delivery-settings', '/admin/dashboard'].includes(value) ? value : '/';
}
