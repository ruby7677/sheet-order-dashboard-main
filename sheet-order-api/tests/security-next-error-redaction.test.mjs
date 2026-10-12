import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(apiRoot, 'node_modules', 'wrangler', 'package.json'));
const esbuild = require('esbuild');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lopokao-security-next-errors-'));
const entry = path.join(temporary, 'entry.ts');
const bundle = path.join(temporary, 'api.mjs');
fs.writeFileSync(entry, `
  export { default as app } from ${JSON.stringify(path.join(apiRoot, 'src/index.ts'))};
  export { CacheService } from ${JSON.stringify(path.join(apiRoot, 'src/services/CacheService.ts'))};
  export { GoogleSheetsService } from ${JSON.stringify(path.join(apiRoot, 'src/services/GoogleSheetsService.ts'))};
  export { OrderSheets } from ${JSON.stringify(path.join(apiRoot, 'src/services/OrderSheets.ts'))};
  export { ApiError } from ${JSON.stringify(path.join(apiRoot, 'src/types.ts'))};
`);
await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'browser', format: 'esm', nodePaths: [path.join(apiRoot, 'node_modules')] });
const { app, CacheService, GoogleSheetsService, OrderSheets, ApiError } = await import(pathToFileURL(bundle).href);

const team = 'security-next.cloudflareaccess.com';
const audience = 'security-next-test-audience';
const origin = 'https://dashboard.security-next.example.invalid';
const jwksUrl = `https://${team}/cdn-cgi/access/certs`;
const keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
jwk.kid = 'security-next-error-fixture';
const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const issuedAt = Math.floor(Date.now() / 1000);
const header = base64url({ alg: 'RS256', kid: jwk.kid });
const claims = base64url({ sub: 'synthetic-admin', email: 'admin@example.invalid', iss: `https://${team}`, aud: audience, iat: issuedAt, exp: issuedAt + 600 });
const signingInput = `${header}.${claims}`;
const jwt = `${signingInput}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(signingInput))).toString('base64url')}`;

const marker = 'FAKE_PRIVATE_MARKER phone=0912345678 address=Fake-Customer-Address https://sheets.googleapis.com/v4/spreadsheets/fixture SELECT-private-customer';
const customerHeader = ['姓名', '電話', '取貨方式', '地址', '透過什麼聯繫賣家', '社交軟體名字', '訂單時間', '購買項目'];
const customerRows = [
  customerHeader,
  ['Fixture TW local', '0912-345-678', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-01', 'item x 1'],
  ['Fixture TW alias', "'00886(912)345-678", '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-02', 'item x 1'],
  ['Fixture US', '+1 415-555-2671', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-03', 'item x 1'],
  ['Fixture UK', '+44 21 5555 2671', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-04', 'item x 1'],
  ['Fixture invalid', 'not-a-phone', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-05', 'item x 1'],
  ['Fixture blank phone', '', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-06', 'item x 1'],
  ['', '0912345678', '宅配到府', 'Fixture address', '電話', 'ID', '2026-09-07', 'item x 1'],
];
const orderHeader = Array(18).fill('header');
const orderRow = Array(18).fill('');
orderRow[0] = '2026-10-02'; orderRow[1] = 'Fixture order'; orderRow[2] = '0912345678'; orderRow[8] = 'fixture item x 1';
orderRow[14] = '訂單確認中'; orderRow[15] = '未收費';

let sheetFailure = '';
const previousGetSheetData = GoogleSheetsService.prototype.getSheetData;
const previousRows = OrderSheets.prototype.rows;
GoogleSheetsService.prototype.getSheetData = async function () {
  if (sheetFailure) throw new Error(marker);
  return customerRows.map(row => row.slice());
};
OrderSheets.prototype.rows = async function () {
  if (sheetFailure === 'orders') throw new Error(marker);
  return [orderHeader.slice(), orderRow.slice()];
};

const cacheValues = new Map();
const cacheCalls = [];
const cacheKv = {
  async get(key) { cacheCalls.push(['get', key]); return cacheValues.get(key) ?? null; },
  async put(key, value) { cacheCalls.push(['put', key]); cacheValues.set(key, JSON.parse(value)); },
  async delete(key) { cacheCalls.push(['delete', key]); cacheValues.delete(key); },
  async list(options) { cacheCalls.push(['list', options?.prefix]); return { keys: [] }; },
};
const env = {
  APP_ENV: 'test', ACCESS_TEAM_DOMAIN: team, ACCESS_AUDIENCE: audience, ADMIN_EMAILS: 'admin@example.invalid',
  ALLOWED_ORIGINS: origin, GOOGLE_SERVICE_ACCOUNT_KEY: 'synthetic-key-only', GOOGLE_SHEET_ID: 'fixture-sheet', TEST_SHEET_ID: 'fixture-sheet', PRODUCTION_SHEET_ID: 'different-production-sheet',
  ORDER_SHEET_NAME: 'security_next_orders', CUSTOMER_SHEET_NAME: 'security_next_customers',
  CACHE_DURATION: '15', CACHE_KV: cacheKv, CATALOG_DB: { prepare() { return { bind() { return { first: async () => ({ count: 1 }) }; } }; } },
};
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const logLines = [];
globalThis.fetch = async input => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === jwksUrl) return Response.json({ keys: [jwk] });
  throw new Error('Unexpected network request in isolated error-redaction test');
};
console.error = (...args) => logLines.push(args.map(value => String(value)).join(' '));
const headers = { 'Cf-Access-Jwt-Assertion': jwt, Origin: origin };
const request = (route, options = {}) => app.request(`https://admin.security-next.internal${route}`, { headers, ...options }, env);
const assertNoMarker = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const fragment of ['FAKE_PRIVATE_MARKER', '0912345678', 'Fake-Customer-Address', 'sheets.googleapis.com', 'SELECT-private-customer']) assert.ok(!text.includes(fragment), `Unexpected sensitive marker: ${fragment}`);
};

try {
  for (const [route, failMode, fixedEvent] of [
    ['/api/customers', 'customers', 'get_customers_from_sheet.failed'],
    ['/api/customers/orders?phone=0912345678', 'customers', 'get_customer_orders.failed'],
    ['/api/admin/dashboard?refresh=1', 'orders', 'get_admin_dashboard.failed'],
  ]) {
    sheetFailure = failMode;
    logLines.length = 0;
    const response = await request(route);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.success, false);
    assertNoMarker(body);
    assert.equal(Object.hasOwn(body, 'error'), false);
    assert.deepEqual(logLines, [fixedEvent]);
    assertNoMarker(logLines);
  }

  // A provider ApiError keeps its status and fixed code but never its raw provider message.
  sheetFailure = '';
  const previousProviderData = GoogleSheetsService.prototype.getSheetData;
  GoogleSheetsService.prototype.getSheetData = async () => { throw new ApiError(403, marker, 'SHEETS_API_ERROR'); };
  logLines.length = 0;
  const providerError = await request('/api/customers');
  assert.equal(providerError.status, 403);
  const providerBody = await providerError.json();
  assert.deepEqual({ success: providerBody.success, code: providerBody.code, message: providerBody.message }, {
    success: false, code: 'SHEETS_API_ERROR', message: '無法從 Google Sheets 獲取客戶資料',
  });
  assertNoMarker(providerBody);
  assert.deepEqual(logLines, ['get_customers_from_sheet.failed']);
  GoogleSheetsService.prototype.getSheetData = previousProviderData;

  // A deliberately controlled ApiError keeps its status/code and safe Chinese message.
  sheetFailure = '';
  const previousCustomerData = GoogleSheetsService.prototype.getSheetData;
  GoogleSheetsService.prototype.getSheetData = async () => [['姓名', '電話']];
  logLines.length = 0;
  const missingFields = await request('/api/customers/orders?phone=0912345678');
  assert.equal(missingFields.status, 500);
  assert.deepEqual(await missingFields.json().then(({ success, code, message }) => ({ success, code, message })), {
    success: false, code: 'MISSING_REQUIRED_FIELDS', message: '客戶名單工作表缺少必要欄位',
  });
  assert.deepEqual(logLines, ['get_customer_orders.failed']);
  GoogleSheetsService.prototype.getSheetData = previousCustomerData;

  // Dashboard count matches the customer-list phone grouping: TW aliases merge, distinct country codes and invalid rows stay separate.
  const dashboardResponse = await request('/api/admin/dashboard?refresh=1');
  assert.equal(dashboardResponse.status, 200);
  const dashboardBody = await dashboardResponse.json();
  assert.equal(dashboardBody.data.totalCustomers, 4);
  assert.deepEqual(cacheCalls.filter(([operation, key]) => operation === 'put' && key === 'admin_dashboard_v2').map(([, key]) => key), ['admin_dashboard_v2']);

  const cacheLogLines = [];
  const originalCacheConsoleError = console.error;
  console.error = (...args) => cacheLogLines.push(args.map(String).join(' '));
  const failingKv = {
    async get() { throw new Error(marker); }, async put() { throw new Error(marker); },
    async delete() { throw new Error(marker); }, async list() { throw new Error(marker); },
  };
  const cache = new CacheService(failingKv, 30);
  await cache.get('0912345678:private-cache-key');
  await cache.set('0912345678:private-cache-key', { value: 1 });
  await cache.delete('0912345678:private-cache-key');
  await cache.invalidate('0912345678:private-pattern');
  await cache.getStatus('0912345678:private-cache-key');
  await cache.getStats('0912345678:private-pattern');
  assert.deepEqual(cacheLogLines, [
    'cache.get.failed', 'cache.set.failed', 'cache.delete.failed',
    'cache.invalidate.failed', 'cache.get_status.failed', 'cache.get_stats.failed',
  ]);
  assertNoMarker(cacheLogLines);
  for (const value of ['private-cache-key', 'private-pattern', '0912345678']) assert.ok(!cacheLogLines.join(' ').includes(value));
  console.error = originalCacheConsoleError;

  console.log('PASS: provider exceptions, PII cache keys/patterns, and raw errors are redacted from API responses and logs; controlled errors retain safe status/code/message; Dashboard uses the same canonical customer phone grouping as the list. All data and failures are synthetic; no Google Sheets, D1, or SMS calls are made.');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  GoogleSheetsService.prototype.getSheetData = previousGetSheetData;
  OrderSheets.prototype.rows = previousRows;
  fs.rmSync(temporary, { recursive: true, force: true });
}
