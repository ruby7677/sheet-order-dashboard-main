export const adminApiBase = (): string => '/api';
export const ADMIN_AUTH_FAILURE = 'admin-auth-failure';
export async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://')) throw new Error('無效的管理 API 路徑');
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  const response = await fetch(adminApiBase()+endpoint.replace(/^\/api(?=\/|$)/, ''), {redirect:'manual', ...options, headers, credentials:'same-origin', cache:'no-store'});
  if (endpoint !== '/auth/me') {
    if (response.status === 401 || response.type === 'opaqueredirect') { window.dispatchEvent(new CustomEvent(ADMIN_AUTH_FAILURE, { detail: 'expired' })); }
    else if (response.status === 403) {
      const data = await response.clone().json().catch(() => null);
      if (data?.code === 'ADMIN_NOT_ALLOWED') { window.dispatchEvent(new CustomEvent(ADMIN_AUTH_FAILURE, { detail: 'forbidden' })); }
    }
  }
  return response;
}
