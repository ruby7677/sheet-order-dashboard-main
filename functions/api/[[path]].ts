interface PagesEnv { ADMIN_API?: Fetcher }

// Same-origin browser traffic; the Worker verifies the signed Access assertion.
// No public HTTP fallback: a missing service binding must fail closed.
export const onRequest: PagesFunction<PagesEnv> = async ({ request, env }) => {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return Response.json({ success: false, code: 'ACCESS_LOGIN_REQUIRED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!env.ADMIN_API) return Response.json({ success: false, code: 'ADMIN_API_NOT_CONFIGURED' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const headers = new Headers(request.headers);
  headers.delete('Authorization');
  headers.delete('Cookie');
  headers.set('Cf-Access-Jwt-Assertion', assertion);
  const url = new URL(request.url);
  url.hostname = 'admin-api.internal';
  url.protocol = 'https:';
  url.port = '';
  const response = await env.ADMIN_API.fetch(new Request(url, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' }));
  const output = new Response(response.body, response);
  output.headers.set('Cache-Control', 'no-store');
  output.headers.set('X-Content-Type-Options', 'nosniff');
  output.headers.delete('Set-Cookie');
  return output;
};
