import type { Context, MiddlewareHandler } from 'hono';

export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUDIENCE?: string;
  ADMIN_EMAILS?: string;
  ALLOWED_ORIGINS?: string;
  APP_ENV?: string;
  GOOGLE_SHEET_ID?: string;
  TEST_SHEET_ID?: string;
  PRODUCTION_SHEET_ID?: string;
}
export interface AdminIdentity { id: string; email: string; role: 'admin' }
declare module 'hono' { interface ContextVariableMap { admin: AdminIdentity } }
type AccessClaims = { sub?: unknown; email?: unknown; exp?: unknown; iat?: unknown; nbf?: unknown; iss?: unknown; aud?: unknown };
type AccessKey = JsonWebKey & { kid?: string };
// Only public signing keys are cached, never users, tokens or request state.
const keyCache = new Map<string, { expires: number; keys: AccessKey[] }>();

export class AccessError extends Error {
  constructor(public status: 401 | 403 | 503, public code: string) { super(code); }
}
function configuration(env: AccessEnv) {
  const team = env.ACCESS_TEAM_DOMAIN || '';
  const audience = env.ACCESS_AUDIENCE || '';
  const emails = (env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(team) || !audience || !emails.length) {
    throw new AccessError(503, 'ADMIN_AUTH_NOT_CONFIGURED');
  }
  return { issuer: `https://${team}`, audience, emails };
}
function decode(part: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new AccessError(401, 'INVALID_ACCESS_TOKEN');
  try { return Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - part.length % 4) % 4)), c => c.charCodeAt(0)); }
  catch { throw new AccessError(401, 'INVALID_ACCESS_TOKEN'); }
}
async function signingKeys(issuer: string, fetcher: typeof fetch): Promise<AccessKey[]> {
  const cached = keyCache.get(issuer);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, { signal: controller.signal });
    if (!response.ok) throw new Error('jwks unavailable');
    const value = await response.json() as { keys?: AccessKey[] };
    const keys = value.keys?.filter(k => k.kty === 'RSA' && typeof k.kid === 'string' && typeof k.n === 'string' && typeof k.e === 'string');
    if (!keys?.length) throw new Error('jwks missing');
    keyCache.set(issuer, { keys, expires: Date.now() + 300000 });
    return keys;
  } catch { throw new AccessError(503, 'ACCESS_KEYS_UNAVAILABLE'); }
  finally { clearTimeout(timeout); }
}
export async function verifyAccessToken(token: string, env: AccessEnv, fetcher: typeof fetch = fetch): Promise<AdminIdentity> {
  const config = configuration(env);
  if (!token || token.length > 16384) throw new AccessError(401, 'ACCESS_LOGIN_REQUIRED');
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessError(401, 'INVALID_ACCESS_TOKEN');
  const [head, body, signature] = parts as [string, string, string];
  let header: { alg?: unknown; kid?: unknown }, claims: AccessClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(decode(head)));
    claims = JSON.parse(new TextDecoder().decode(decode(body)));
  } catch { throw new AccessError(401, 'INVALID_ACCESS_TOKEN'); }
  const now = Math.floor(Date.now() / 1000);
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 128 || !claims ||
      claims.iss !== config.issuer || typeof claims.exp !== 'number' || claims.exp <= now ||
      typeof claims.iat !== 'number' || claims.iat > now + 60 ||
      (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > now)) ||
      !(claims.aud === config.audience || (Array.isArray(claims.aud) && claims.aud.includes(config.audience)))) {
    throw new AccessError(401, 'INVALID_ACCESS_TOKEN');
  }
  const keys = await signingKeys(config.issuer, fetcher);
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new AccessError(401, 'INVALID_ACCESS_TOKEN');
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(signature), new TextEncoder().encode(`${head}.${body}`));
    if (!valid) throw new Error('signature invalid');
  } catch { throw new AccessError(401, 'INVALID_ACCESS_TOKEN'); }
  if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !config.emails.includes(claims.email.toLowerCase())) {
    throw new AccessError(403, 'ADMIN_NOT_ALLOWED');
  }
  return { id: claims.sub, email: claims.email.toLowerCase(), role: 'admin' };
}
export function allowedOrigins(env: AccessEnv): string[] {
  return (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(x => {
    try { const u = new URL(x); return u.origin === x && (u.protocol === 'https:' || (env.APP_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname))); }
    catch { return false; }
  });
}
function failure(c: Context, error: AccessError): Response {
  return c.json({ success: false, message: '管理身分驗證失敗', code: error.code }, error.status);
}
export const requireAdmin: MiddlewareHandler<{ Bindings: AccessEnv }> = async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Vary', 'Origin');
  if (['development', 'test'].includes(c.env.APP_ENV || '') &&
      (!c.env.TEST_SHEET_ID || c.env.GOOGLE_SHEET_ID !== c.env.TEST_SHEET_ID || c.env.TEST_SHEET_ID === c.env.PRODUCTION_SHEET_ID)) {
    return failure(c, new AccessError(503, 'ISOLATED_TEST_SHEET_REQUIRED'));
  }
  const origin = c.req.header('Origin');
  if ((origin && !allowedOrigins(c.env).includes(origin)) || (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && !origin)) {
    return failure(c, new AccessError(403, 'ORIGIN_NOT_ALLOWED'));
  }
  try {
    const identity = await verifyAccessToken(c.req.header('Cf-Access-Jwt-Assertion') || '', c.env);
    c.set('admin', identity);
  } catch (error) {
    return failure(c, error instanceof AccessError ? error : new AccessError(503, 'ADMIN_AUTH_UNAVAILABLE'));
  }
  await next();
};
