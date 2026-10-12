import {createSQLiteTestDatabase}from './sqlite-d1-adapter.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
const project = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../node_modules/wrangler/package.json', import.meta.url));
const esbuild = require('esbuild');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lopokao-auth-test-'));
const entry = path.join(temporary, 'entry.ts');
const index = path.join(project, 'src/index.ts');
const access = path.join(project, 'src/security/access.ts');
fs.writeFileSync(entry, 'export { default as app } from '+JSON.stringify(index)+';\nexport { verifyAccessToken } from '+JSON.stringify(access)+';\nexport { GoogleSheetsService } from '+JSON.stringify(path.join(project,'src/services/GoogleSheetsService.ts'))+';export {OrderSheets}from '+JSON.stringify(path.join(project,'src/services/OrderSheets.ts'))+';export {OrderConflict,rowRevision}from '+JSON.stringify(path.join(project,'src/services/OrderContract.ts'))+';');
const output = path.join(temporary, 'bundle.mjs');
await esbuild.build({ entryPoints: [entry], outfile: output, bundle: true, platform: 'browser', format: 'esm', nodePaths: [path.join(project, 'node_modules')] });
const { app, verifyAccessToken, GoogleSheetsService,OrderSheets,OrderConflict,rowRevision } = await import(pathToFileURL(output).href);
const env = { APP_ENV: 'production', ACCESS_TEAM_DOMAIN: 'audit-test.cloudflareaccess.com', ACCESS_AUDIENCE: 'audit-audience', ADMIN_EMAILS: 'admin@example.invalid', ALLOWED_ORIGINS: 'https://dashboard.example.invalid',ADMIN_WRITE_EMAILS:'admin@example.invalid',ADMIN_DELETE_EMAILS:'admin@example.invalid',ADMIN_PRICING_EMAILS:'admin@example.invalid',ORDER_WRITE_READY:'1' };
const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey); jwk.kid = 'audit-key';
let googleCalls = 0, jwksCalls = 0, catalogReads = 0;
env.CATALOG_DB={prepare:(sql)=>sql.includes('admin_request_limits')?{bind:()=>({first:async()=>({count:1})})}:({first:async()=>{catalogReads++;return {revision:1,write_ready:0,payload:JSON.stringify({products:[{id:'fixture-product',name:'Fixture product',price:100,stock_quantity:8,stock_status:'available',is_active:true}],delivery:{delivery_period:{start_date:'2026-10-01',end_date:'2026-10-02'},delivery_rules:{home_delivery:{exclude_sunday:true,advance_days:0},store_pickup:{exclude_sunday:false,advance_days:0}}}})};}})};
globalThis.fetch = async (url, options) => {
  if (String(url) === 'https://audit-test.cloudflareaccess.com/cdn-cgi/access/certs') { jwksCalls++; return Response.json({ keys: [jwk] }); }
  googleCalls++; throw new Error('Unexpected external request in isolated test');
};
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'audit-admin', email: 'admin@example.invalid', iss: 'https://audit-test.cloudflareaccess.com', aud: ['audit-audience'], iat: now, exp: now + 600 };
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url');
async function token(payload = claims, header = { alg: 'RS256', kid: 'audit-key' }) {
  const input = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(input));
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}
const valid = await token();
assert.equal((await verifyAccessToken(valid, env)).role, 'admin');
for (const [name, candidate, status] of [
  ['expired', await token({ ...claims, exp: now - 1 }), 401],
  ['wrong audience', await token({ ...claims, aud: ['other'] }), 401],
  ['wrong issuer', await token({ ...claims, iss: 'https://attacker.invalid' }), 401],
  ['missing expiry', await token({ ...claims, exp: undefined }), 401],
  ['unapproved email', await token({ ...claims, email: 'other@example.invalid' }), 403],
  ['algorithm substitution', await token(claims, { alg: 'none', kid: 'audit-key' }), 401],
  ['forged signature', valid.slice(0, valid.lastIndexOf('.') + 1) + 'AAAA', 401],
]) {
  await assert.rejects(() => verifyAccessToken(candidate, env), e => e.status === status, name);
}
const getRoutes = ['/api/settings/products', '/api/settings/delivery', '/api/orders', '/api/customers', '/api/get_orders_from_sheet.php', '/api/get_customers_from_sheet.php', '/api/get_customer_orders.php', '/api/admin/dashboard', '/api/products', '/api/auth/me'];
for (const path of getRoutes) assert.equal((await app.request('https://admin-api.internal' + path, { method: 'GET' }, env)).status, 401, path);
for (const path of ['/api/update_order_status.php', '/api/update_payment_status.php', '/api/update_order_items.php', '/api/delete_order.php', '/api/batch_delete_orders.php']) {
  const response = await app.request('https://admin-api.internal' + path, { method: 'POST', headers: { Origin: 'https://dashboard.example.invalid', 'Content-Type': 'application/json' }, body: '{invalid-json' }, env);
  assert.equal(response.status, 401, path);
}
assert.equal(catalogReads,0,'Unauthenticated settings reads must not reach D1');
const settingsHeaders={'Cf-Access-Jwt-Assertion':valid};
const productSettings=await app.request('https://admin-api.internal/api/settings/products',{headers:settingsHeaders},env);assert.equal(productSettings.status,200);assert.equal((await productSettings.json()).data[0].id,'fixture-product');
const deliverySettings=await app.request('https://admin-api.internal/api/settings/delivery',{headers:settingsHeaders},env);assert.equal(deliverySettings.status,200);assert.equal((await deliverySettings.json()).data.delivery_period.start_date,'2026-10-01');
const pendingSave=await app.request('https://admin-api.internal/api/settings/products',{method:'PUT',headers:{...settingsHeaders,Origin:'https://dashboard.example.invalid'},body:'{}'},env);assert.equal(pendingSave.status,503);assert.equal(catalogReads,2);
for(const [path,method] of [['/api/settings/products','POST'],['/api/settings/products/fixture-product','PUT'],['/api/settings/products/fixture-product','DELETE'],['/api/settings/delivery','PUT']])assert.equal((await app.request('https://admin-api.internal'+path,{method,headers:{Origin:'https://dashboard.example.invalid'},body:'{}'},env)).status,401);
assert.equal(catalogReads,2);
assert.equal((await app.request('https://admin-api.internal/api/settings/products',{headers:settingsHeaders},{...env,CATALOG_DB:undefined})).status,503,'Missing D1 must not silently fall back to JSON');
const approved = await app.request('https://admin-api.internal/api/auth/me', { headers: { 'Cf-Access-Jwt-Assertion': valid } }, env);
assert.equal(approved.status, 200); assert.equal((await approved.json()).logged_in, true);
assert.equal((await app.request('https://admin-api.internal/api/orders', { headers: { Origin: 'https://unrelated.pages.dev', 'Cf-Access-Jwt-Assertion': valid } }, env)).status, 403);
assert.equal((await app.request('https://admin-api.internal/api/orders', { method: 'PUT', headers: { 'Cf-Access-Jwt-Assertion': valid } }, env)).status, 403);
assert.equal((await app.request('https://admin-api.internal/api/auth/me', { headers: { 'Cf-Access-Jwt-Assertion': valid } }, { ...env, ACCESS_AUDIENCE: '' })).status, 503);
assert.equal((await app.request('https://admin-api.internal/api/orders', {}, { ...env, APP_ENV: 'development', GOOGLE_SHEET_ID: 'live', TEST_SHEET_ID: 'live', PRODUCTION_SHEET_ID: 'live' })).status, 503);

const db=createSQLiteTestDatabase();for(const file of ['0001_catalog.sql','0002_order_operations.sql'])for(const sql of fs.readFileSync(path.join(project,'migrations',file),'utf8').split(/;\s*(?=CREATE |$)/).filter(x=>x.trim()))await db.prepare(sql).run();
const writes=[];let sheetReads=0;const id='12345678-1234-4123-8123-123456789abc',rows=new Map();const row=Array(18).fill('');row[1]='Fixture';row[8]='Fixture x 1';row[9]='200';row[14]='訂單確認中';row[16]=id;rows.set(id,row);
OrderSheets.prototype.locate=async target=>{sheetReads++;if(!rows.has(target))throw new OrderConflict(404,'NOT_FOUND','Fixture missing');return [...rows.get(target)];};OrderSheets.prototype.write=async(target,fields)=>{writes.push(fields);for(const [k,v]of Object.entries(fields))rows.get(target)[Number(k)]=String(v);};
const paymentEnv={...env,CATALOG_DB:db,GOOGLE_SERVICE_ACCOUNT_KEY:'fixture-only',GOOGLE_SHEET_ID:'fixture-sheet',CACHE_KV:{delete:async()=>{}}},headers={'Cf-Access-Jwt-Assertion':valid,Origin:'https://dashboard.example.invalid','Content-Type':'application/json'};
for(const input of [{id:'1',status:'已收費'},{id,status:'=1+1'},{id,status:['已收費']},{id,status:'已收費',paymentStatus:'未收費'}]){const before=sheetReads;const response=await app.request('https://admin-api.internal/api/orders/payment',{method:'PUT',headers,body:JSON.stringify(input)},paymentEnv);assert.equal(response.status,400);assert.equal(sheetReads,before);}
const request={id,status:'已收費',expected_revision:await rowRevision(row),operation_id:crypto.randomUUID()};const paid=await app.request('https://admin-api.internal/api/orders/payment',{method:'PUT',headers,body:JSON.stringify(request)},paymentEnv);assert.equal(paid.status,200);assert.deepEqual(writes[0],{'15':'已收費'});const again=await app.request('https://admin-api.internal/api/update_payment_status.php',{method:'POST',headers,body:JSON.stringify(request)},paymentEnv);assert.equal(again.status,200);assert.equal(writes.length,1);
const denied=await app.request('https://admin-api.internal/api/orders',{method:'DELETE',headers,body:JSON.stringify({...request,status:undefined,operation_id:crypto.randomUUID()})},{...paymentEnv,ADMIN_DELETE_EMAILS:''});assert.equal(denied.status,403);assert.equal(writes.length,1);
await db.prepare('DELETE FROM admin_request_limits').run();for(let n=0;n<120;n++)assert.equal((await app.request('https://admin-api.internal/api/auth/me',{headers:{'Cf-Access-Jwt-Assertion':valid}},paymentEnv)).status,200);assert.equal((await app.request('https://admin-api.internal/api/auth/me',{headers:{'Cf-Access-Jwt-Assertion':valid}},paymentEnv)).status,429,'Authenticated read cap enforced in real SQLite');db.close();
console.log('PASS: UUID/version contract, malformed payment rejection, exact targeted field update, replay and granular delete permission. Mock Sheets only.');
assert.equal(googleCalls, 0); assert.equal(jwksCalls, 1);
console.log('PASS: JWT signature/claims/admin allowlist, all anonymous read/write aliases, Origin, fail-closed config and test-sheet isolation. No Google/data operations executed.');

if (path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temporary).startsWith('lopokao-auth-test-')) fs.rmSync(temporary, { recursive: true, force: true });
