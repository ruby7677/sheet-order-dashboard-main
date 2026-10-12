export const adminApiBase = (): string => '/api';
export async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://')) throw new Error('無效的管理 API 路徑');
  const headers = new Headers(options.headers);
  headers.delete('Authorization');
  return fetch(adminApiBase()+endpoint.replace(/^\/api(?=\/|$)/, ''), {...options, headers, credentials:'same-origin', cache:'no-store'});
}
