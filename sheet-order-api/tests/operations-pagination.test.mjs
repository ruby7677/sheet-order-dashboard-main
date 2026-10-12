import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSQLiteTestDatabase } from './sqlite-d1-adapter.mjs';

const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(path.join(apiRoot, 'node_modules', 'wrangler', 'package.json'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lopokao-operations-pagination-'));
const tempPrefix = (path.resolve(os.tmpdir()).endsWith(path.sep) ? path.resolve(os.tmpdir()) : path.resolve(os.tmpdir()) + path.sep).toLowerCase();
if (!path.resolve(temporary).toLowerCase().startsWith(tempPrefix)) throw new Error('Unsafe temporary directory');

const entry = path.join(temporary, 'entry.ts');
const bundle = path.join(temporary, 'operations-pagination.mjs');
const migrations = path.join(apiRoot, 'migrations');
const database = createSQLiteTestDatabase();
const priorFetch = globalThis.fetch;
const priorConsoleError = console.error;

try {
  fs.writeFileSync(entry, [
    `export {default as app} from ${JSON.stringify(path.join(apiRoot, 'src/index.ts'))};`,
    `export {OrderWriteService} from ${JSON.stringify(path.join(apiRoot, 'src/services/OrderWriteService.ts'))};`,
    `export {paginateOperationsSnapshot,validateOperationsPageEnvelope} from ${JSON.stringify(path.join(apiRoot, 'src/services/OperationsPagination.ts'))};`,
  ].join('\n'));
  await require('esbuild').build({
    entryPoints: [entry],
    outfile: bundle,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    nodePaths: [path.join(apiRoot, 'node_modules')],
  });
  const { app, OrderWriteService, paginateOperationsSnapshot, validateOperationsPageEnvelope } = await import(pathToFileURL(bundle).href);

  const schema = fs.readFileSync(path.join(migrations, '0002_order_operations.sql'), 'utf8');
  for (const statement of schema.split(/;\s*(?=CREATE |$)/).filter(value => value.trim())) {
    await database.prepare(statement).run();
  }

  const team = 'operations-pagination.cloudflareaccess.com';
  const audience = 'synthetic-operations-pagination-audience';
  const origin = 'https://dashboard.operations-pagination.example.invalid';
  const jwksUrl = `https://${team}/cdn-cgi/access/certs`;
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  jwk.kid = 'operations-pagination-fixture';
  const base64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenFor = async email => {
    const header = base64url({ alg: 'RS256', kid: jwk.kid });
    const claims = base64url({
      sub: email,
      email,
      iss: `https://${team}`,
      aud: audience,
      iat: issuedAt,
      exp: issuedAt + 600,
    });
    const signingInput = `${header}.${claims}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
  };
  const firstToken = await tokenFor('admin@example.invalid');
  const secondToken = await tokenFor('second-admin@example.invalid');
  const baseEnv = {
    APP_ENV: 'test',
    ACCESS_TEAM_DOMAIN: team,
    ACCESS_AUDIENCE: audience,
    ADMIN_EMAILS: 'admin@example.invalid,second-admin@example.invalid',
    ALLOWED_ORIGINS: origin,
    ADMIN_WRITE_EMAILS: 'admin@example.invalid,second-admin@example.invalid',
    ADMIN_DELETE_EMAILS: 'admin@example.invalid,second-admin@example.invalid',
    ADMIN_PRICING_EMAILS: 'admin@example.invalid,second-admin@example.invalid',
    GOOGLE_SERVICE_ACCOUNT_KEY: 'synthetic-service-key',
    GOOGLE_SHEET_ID: 'synthetic-sheet-id',
    TEST_SHEET_ID: 'synthetic-sheet-id',
    PRODUCTION_SHEET_ID: 'separate-production-fixture-id',
    ORDER_SHEET_NAME: 'security_next_ops_orders',
    CUSTOMER_SHEET_NAME: 'security_next_ops_customers',
    ORDER_WRITE_READY: '0',
    CATALOG_DB: database,
  };

  const unexpectedFetches = [];
  globalThis.fetch = async input => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === jwksUrl) return Response.json({ keys: [jwk] });
    unexpectedFetches.push(url);
    throw new Error('Unexpected network request in isolated operations pagination test');
  };
  const safeLogs = [];
  console.error = (...values) => safeLogs.push(values.map(String).join(' '));

  const request = (route, token = firstToken, extraEnv = {}) => app.request(
    `https://admin.operations-pagination.internal${route}`,
    { headers: { 'Cf-Access-Jwt-Assertion': token, Origin: origin } },
    { ...baseEnv, ...extraEnv },
  );
  const rowValues = index => ({
    id: `operation-${String(index).padStart(4, '0')}`,
    order_id: `fixture-order-${String(index).padStart(4, '0')}`,
    expected_hash: 'e'.repeat(64),
    fingerprint: 'f'.repeat(64),
    actor: 'fixture-actor@example.invalid',
    kind: 'payment',
    before_fields: JSON.stringify({ fields: { 15: 'fixture-before' } }),
    after_fields: JSON.stringify({ fields: { 15: 'fixture-after' } }),
    result: '{}',
    created_at: '2026-10-03T04:00:00.000Z',
    updated_at: '2026-10-03T04:00:00.000Z',
  });
  const insertOperation = (index, phase = 'pending') => {
    const row = rowValues(index);
    database.prepare('INSERT INTO order_operations (id,order_id,expected_hash,fingerprint,actor,kind,before_fields,after_fields,phase,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(row.id, row.order_id, row.expected_hash, row.fingerprint, row.actor, row.kind, row.before_fields, row.after_fields, phase, row.result, row.created_at, row.updated_at).run();
    if (phase === 'completed' || phase === 'rejected') {
      database.prepare('INSERT INTO order_operation_effects (operation_id,effect,actor,reason,created_at) VALUES(?,?,?,?,?)')
        .bind(row.id, phase, 'fixture-resolver@example.invalid', 'Synthetic reconciliation fixture', row.updated_at).run();
    }
  };
  for (let index = 0; index <= 100; index += 1) insertOperation(index);
  insertOperation(101, 'completed');
  insertOperation(102, 'rejected');

  const unauthenticated = await app.request(
    'https://admin.operations-pagination.internal/api/orders/pending?page_size=101',
    { headers: { Origin: origin } },
    baseEnv,
  );
  assert.equal(unauthenticated.status, 401, 'Access validation remains ahead of pagination parsing and data reads');

  const legacyPending = await request('/api/orders/pending');
  assert.equal(legacyPending.status, 409);
  assert.equal((await legacyPending.json()).code, 'OPERATIONS_RELOAD_REQUIRED');
  const legacyAudit = await request('/api/orders/audit');
  assert.equal(legacyAudit.status, 409);
  assert.equal((await legacyAudit.json()).code, 'OPERATIONS_RELOAD_REQUIRED');

  const pendingFirstResponse = await request('/api/orders/pending?page_size=100');
  assert.equal(pendingFirstResponse.status, 200);
  const pendingFirst = await pendingFirstResponse.json();
  assert.equal(pendingFirst.data.length, 100);
  assert.deepEqual(
    [pendingFirst.data[0].id, pendingFirst.data[99].id],
    ['operation-0000', 'operation-0099'],
    'pending ties use ascending operation ID',
  );
  assert.deepEqual(
    pendingFirst.pagination,
    {
      version: 1,
      total: 101,
      page_size: 100,
      has_more: true,
      next_cursor: pendingFirst.pagination.next_cursor,
      snapshot_revision: pendingFirst.pagination.snapshot_revision,
    },
  );
  assert.match(pendingFirst.pagination.next_cursor, /^[A-Za-z0-9_-]+$/);
  assert.equal(pendingFirst.pagination.snapshot_revision.length, 64);
  const cursorContent = JSON.parse(Buffer.from(pendingFirst.pagination.next_cursor, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(cursorContent).sort(), ['offset', 'page_size', 'scope_hash', 'snapshot_revision', 'version']);
  assert.equal(cursorContent.version, 1);
  assert.equal(cursorContent.offset, 100);
  assert.equal(cursorContent.page_size, 100);
  assert.equal(cursorContent.snapshot_revision, pendingFirst.pagination.snapshot_revision);
  assert.ok(!pendingFirst.pagination.next_cursor.includes('admin@example.invalid'), 'cursor does not contain actor PII');

  const pendingSecondResponse = await request(
    `/api/orders/pending?page_size=100&cursor=${encodeURIComponent(pendingFirst.pagination.next_cursor)}`,
  );
  assert.equal(pendingSecondResponse.status, 200);
  const pendingSecond = await pendingSecondResponse.json();
  assert.deepEqual(pendingSecond.data.map(row => row.id), ['operation-0100']);
  assert.equal(pendingSecond.pagination.has_more, false);
  assert.equal(pendingSecond.pagination.next_cursor, null);
  assert.equal(pendingSecond.pagination.snapshot_revision, pendingFirst.pagination.snapshot_revision);

  const auditFirstResponse = await request('/api/orders/audit?page_size=100');
  assert.equal(auditFirstResponse.status, 200);
  const auditFirst = await auditFirstResponse.json();
  assert.equal(auditFirst.data.length, 100);
  assert.equal(auditFirst.pagination.total, 103);
  assert.deepEqual(
    [auditFirst.data[0].id, auditFirst.data[99].id],
    ['operation-0102', 'operation-0003'],
    'audit ties use descending operation ID',
  );
  assert.equal(auditFirst.data[0].resolved_by, 'fixture-resolver@example.invalid');
  assert.equal(auditFirst.pagination.has_more, true);
  const auditSecondResponse = await request(
    `/api/orders/audit?page_size=100&cursor=${encodeURIComponent(auditFirst.pagination.next_cursor)}`,
  );
  assert.equal(auditSecondResponse.status, 200);
  const auditSecond = await auditSecondResponse.json();
  assert.deepEqual(auditSecond.data.map(row => row.id), ['operation-0002', 'operation-0001', 'operation-0000']);
  const auditIds = [...auditFirst.data, ...auditSecond.data].map(row => row.id);
  assert.equal(auditIds.length, 103);
  assert.equal(new Set(auditIds).size, 103, 'phase-matched effect join does not duplicate operations');

  const actorMismatch = await request(
    `/api/orders/pending?page_size=100&cursor=${encodeURIComponent(pendingFirst.pagination.next_cursor)}`,
    secondToken,
  );
  assert.equal(actorMismatch.status, 400);
  assert.equal((await actorMismatch.json()).code, 'OPERATIONS_PAGE_CURSOR_INVALID');
  for (const route of [
    '/api/orders/pending?page_size=0',
    '/api/orders/audit?page_size=101',
    '/api/orders/pending?page_size=10&page_size=20',
    '/api/orders/audit?cursor=not-a-valid-cursor',
    `/api/orders/pending?cursor=${'a'.repeat(1025)}`,
  ]) {
    const response = await request(route);
    assert.equal(response.status, 400, route);
    assert.ok(['OPERATIONS_PAGE_REQUEST_INVALID', 'OPERATIONS_PAGE_CURSOR_INVALID'].includes((await response.json()).code), route);
  }

  insertOperation(103);
  const expired = await request(
    `/api/orders/pending?page_size=100&cursor=${encodeURIComponent(pendingFirst.pagination.next_cursor)}`,
  );
  assert.equal(expired.status, 409);
  assert.equal((await expired.json()).code, 'OPERATIONS_PAGE_EXPIRED');

  for (const id of ['operation-0100', 'operation-0101', 'operation-0102', 'operation-0103']) {
    database.prepare('DELETE FROM order_operations WHERE id=?').bind(id).run();
  }
  const legacyPendingSmall = await request('/api/orders/pending');
  assert.equal(legacyPendingSmall.status, 200);
  assert.equal((await legacyPendingSmall.json()).data.length, 100, 'legacy pending returns the complete list at the limit');
  const legacyAuditSmall = await request('/api/orders/audit');
  assert.equal(legacyAuditSmall.status, 200);
  assert.equal((await legacyAuditSmall.json()).data.length, 100, 'legacy audit returns the complete list at the limit');

  const actor = 'admin@example.invalid';
  const revision = 'c'.repeat(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ kind: 'checkouts', actor })));
  const scopeHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const externalCursor = offset => Buffer.from(JSON.stringify({
    version: 1,
    offset,
    page_size: 50,
    scope_hash: scopeHash,
    snapshot_revision: revision,
  })).toString('base64url');
  const checkoutItems = offset => Array.from({ length: offset === 60 ? 20 : 30 }, (_, index) => ({
    order_id: `fixture-checkout-${offset + index}`,
    created_at: '2026-10-03T04:00:00.000Z',
    phase: 'order_written',
  }));
  const checkoutEnvelope = offset => ({
    items: checkoutItems(offset),
    pagination: {
      version: 1,
      total: 80,
      page_size: 50,
      has_more: offset < 60,
      next_cursor: offset < 60 ? externalCursor(offset + checkoutItems(offset).length) : null,
      snapshot_revision: revision,
    },
  });
  const validatedShortPage = await validateOperationsPageEnvelope(checkoutEnvelope(0), 50, { kind: 'checkouts', actor });
  assert.equal(validatedShortPage.items.length, 30);
  assert.equal(validatedShortPage.pagination.has_more, true, 'PHP byte-budget short pages may continue');

  const catalogRequests = [];
  let catalogReply = Response.json({ success: true, data: checkoutEnvelope(0) });
  const catalogBinding = {
    fetch: async input => {
      const body = await input.clone().json();
      catalogRequests.push(body);
      if (body.cursor) {
        const decoded = JSON.parse(Buffer.from(body.cursor, 'base64url').toString('utf8'));
        const offset = decoded.offset;
        catalogReply = Response.json({ success: true, data: checkoutEnvelope(offset) });
      }
      return catalogReply;
    },
  };
  const checkoutPageFirstResponse = await request('/api/checkouts/pending?page_size=50', firstToken, { CATALOG_API: catalogBinding });
  assert.equal(checkoutPageFirstResponse.status, 200);
  const checkoutPageFirst = await checkoutPageFirstResponse.json();
  assert.equal(checkoutPageFirst.data.length, 30);
  assert.equal(checkoutPageFirst.pagination.has_more, true);
  assert.deepEqual(catalogRequests[0], { action: 'list_page', page_size: 50 });
  const checkoutPageSecondResponse = await request(
    `/api/checkouts/pending?page_size=50&cursor=${encodeURIComponent(checkoutPageFirst.pagination.next_cursor)}`,
    firstToken,
    { CATALOG_API: catalogBinding },
  );
  assert.equal(checkoutPageSecondResponse.status, 200);
  const checkoutPageSecond = await checkoutPageSecondResponse.json();
  assert.equal(checkoutPageSecond.data.length, 30);
  assert.equal(checkoutPageSecond.pagination.has_more, true);
  const checkoutPageThirdResponse = await request(
    `/api/checkouts/pending?page_size=50&cursor=${encodeURIComponent(checkoutPageSecond.pagination.next_cursor)}`,
    firstToken,
    { CATALOG_API: catalogBinding },
  );
  assert.equal(checkoutPageThirdResponse.status, 200);
  const checkoutPageThird = await checkoutPageThirdResponse.json();
  assert.equal(checkoutPageThird.data.length, 20);
  assert.equal(checkoutPageThird.pagination.has_more, false);
  assert.equal(catalogRequests[1].cursor, checkoutPageFirst.pagination.next_cursor);

  const tooManyLegacyCheckout = await request('/api/checkouts/pending', firstToken, {
    CATALOG_API: { fetch: async () => Response.json({ success: true, data: Array.from({ length: 101 }, (_, index) => ({ order_id: `fixture-${index}` })) }) },
  });
  assert.equal(tooManyLegacyCheckout.status, 409);
  assert.equal((await tooManyLegacyCheckout.json()).code, 'OPERATIONS_RELOAD_REQUIRED');

  const expiredCheckout = await request('/api/checkouts/pending?page_size=50', firstToken, {
    CATALOG_API: {
      fetch: async () => Response.json(
        { success: false, code: 'OPERATIONS_PAGE_EXPIRED', message: 'UNTRUSTED_PROVIDER_MESSAGE' },
        { status: 409 },
      ),
    },
  });
  assert.equal(expiredCheckout.status, 409);
  const expiredCheckoutBody = await expiredCheckout.json();
  assert.equal(expiredCheckoutBody.code, 'OPERATIONS_PAGE_EXPIRED');
  assert.ok(!expiredCheckoutBody.message.includes('UNTRUSTED_PROVIDER_MESSAGE'), 'provider text is never forwarded');

  const oversizedCheckout = await request('/api/checkouts/pending?page_size=50', firstToken, {
    CATALOG_API: { fetch: async () => Response.json({ success: true, data: 'x'.repeat(66_000) }) },
  });
  assert.equal(oversizedCheckout.status, 503);
  assert.equal((await oversizedCheckout.json()).code, 'CATALOG_RESPONSE_TOO_LARGE');

  const invalidPageCheckout = await request('/api/checkouts/pending?page_size=50', firstToken, {
    CATALOG_API: {
      fetch: async () => Response.json({
        success: true,
        data: { items: Array.from({ length: 51 }, () => ({ order_id: 'fixture' })), pagination: checkoutEnvelope(0).pagination },
      }),
    },
  });
  assert.equal(invalidPageCheckout.status, 503);
  assert.equal((await invalidPageCheckout.json()).code, 'CATALOG_RESPONSE_INVALID');

  const badCheckoutSize = await request('/api/checkouts/pending?page_size=101', firstToken, {
    CATALOG_API: { fetch: async () => { throw new Error('Invalid request must not reach Catalog'); } },
  });
  assert.equal(badCheckoutSize.status, 400);
  assert.equal((await badCheckoutSize.json()).code, 'OPERATIONS_PAGE_REQUEST_INVALID');

  await assert.rejects(
    () => paginateOperationsSnapshot('pending', actor, Array.from({ length: 20_001 }, (_, index) => ({ id: index }))),
    error => error.code === 'OPERATIONS_SNAPSHOT_TOO_LARGE' && error.status === 413,
  );
  const overflowMeasure = { results: Array.from({ length: 20_001 }, () => ({ raw_bytes: 1 })) };
  const overflowDb = {
    prepare: () => ({}),
    batch: async () => [overflowMeasure, { results: [] }],
  };
  const overflowService = new OrderWriteService(overflowDb, { locate: async () => [], write: async () => {}, rows: async () => [] });
  await assert.rejects(
    () => overflowService.pendingPage(actor, 50),
    error => error.code === 'OPERATIONS_SNAPSHOT_TOO_LARGE' && error.status === 413,
  );
  await assert.rejects(
    () => overflowService.auditPage(actor, 50),
    error => error.code === 'OPERATIONS_SNAPSHOT_TOO_LARGE' && error.status === 413,
  );
  await assert.rejects(
    () => paginateOperationsSnapshot('audit', actor, [{ text: 'x'.repeat(8 * 1024 * 1024 + 1) }]),
    error => error.code === 'OPERATIONS_SNAPSHOT_TOO_LARGE' && error.status === 413,
  );
  const circular = {};
  circular.self = circular;
  await assert.rejects(
    () => paginateOperationsSnapshot('audit', actor, [circular]),
    error => error.code === 'OPERATIONS_SNAPSHOT_CORRUPT' && error.status === 409,
  );

  assert.deepEqual(unexpectedFetches, [], 'isolated pagination tests make no public-network requests');
  assert.ok(safeLogs.every(line => !line.includes('UNTRUSTED_PROVIDER_MESSAGE')), 'logs do not include raw provider messages');
  console.log('PASS: SQLite pending/audit pagination, legacy boundaries, actor-bound and expired cursors, checkout bridge shape/byte limits, and controlled errors.');
} finally {
  globalThis.fetch = priorFetch;
  console.error = priorConsoleError;
  database.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
