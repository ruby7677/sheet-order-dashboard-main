import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const apiRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(apiRoot,'node_modules','wrangler','package.json'));
const esbuild=require('esbuild');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lopokao-security-next-api-'));
const entry=path.join(temporary,'entry.ts'),bundle=path.join(temporary,'api.mjs');
fs.writeFileSync(entry,`export {default as app} from ${JSON.stringify(path.join(apiRoot,'src/index.ts'))};\nexport {OrderSheets} from ${JSON.stringify(path.join(apiRoot,'src/services/OrderSheets.ts'))};\nexport {OrderWriteService} from ${JSON.stringify(path.join(apiRoot,'src/services/OrderWriteService.ts'))};\nexport {GoogleSheetsService} from ${JSON.stringify(path.join(apiRoot,'src/services/GoogleSheetsService.ts'))};\nexport {CacheService} from ${JSON.stringify(path.join(apiRoot,'src/services/CacheService.ts'))};\nexport {normalizePhoneIdentity,tryNormalizePhoneIdentity,PhoneIdentityError} from ${JSON.stringify(path.join(apiRoot,'src/services/PhoneIdentity.ts'))};\nexport {getSheetNames} from ${JSON.stringify(path.join(apiRoot,'src/services/SheetNames.ts'))};\n`);
await esbuild.build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'browser',format:'esm',nodePaths:[path.join(apiRoot,'node_modules')]});
const {app,OrderSheets,OrderWriteService,GoogleSheetsService,CacheService,normalizePhoneIdentity,tryNormalizePhoneIdentity,PhoneIdentityError,getSheetNames}=await import(pathToFileURL(bundle).href);

function phoneFails(value){assert.throws(()=>normalizePhoneIdentity(value),error=>error instanceof PhoneIdentityError&&error.code==='INVALID_PHONE_IDENTITY');}
assert.deepEqual(getSheetNames({APP_ENV:'production',ORDER_SHEET_NAME:'security_next_wrong',CUSTOMER_SHEET_NAME:'security_next_wrong'}),{orders:'Sheet1',customers:'客戶名單'});
assert.deepEqual(getSheetNames({APP_ENV:'test',ORDER_SHEET_NAME:'security_next_orders',CUSTOMER_SHEET_NAME:'security_next_customers'}),{orders:'security_next_orders',customers:'security_next_customers'});
for(const env of [{APP_ENV:'test'},{APP_ENV:'test',ORDER_SHEET_NAME:'Sheet1',CUSTOMER_SHEET_NAME:'客戶名單'},{APP_ENV:'test',ORDER_SHEET_NAME:'security_next_orders',CUSTOMER_SHEET_NAME:'security_next_orders'}]){
  assert.throws(()=>getSheetNames(env),error=>error?.code==='TEST_SHEET_FIXTURES_REQUIRED');
}

const tw='+886912345678';
for(const alias of ['0912-345-678',"'0912345678",'+886 912-345-678','886912345678','00886(912)345-678'])assert.equal(normalizePhoneIdentity(alias),tw);
assert.equal(normalizePhoneIdentity('+1 (415) 555-2671'),'+14155552671');
assert.equal(normalizePhoneIdentity('+44 21 5555 2671'),'+442155552671');
assert.notEqual(normalizePhoneIdentity('+1 415 555 2671'),normalizePhoneIdentity('+44 21 5555 2671'),'Different country codes remain part of the identity');
for(const invalid of ['',"''0912345678",'abc0912345678','09ABC345678','091234567','8860912345678','+8860912345678','0088612345678','00 1 415 555 2671','4155552671','+1-415-555-2671x'])phoneFails(invalid);
assert.equal(tryNormalizePhoneIdentity('bad phone'),null);

const team='security-next.cloudflareaccess.com',audience='security-next-test-audience',origin='https://dashboard.security-next.example.invalid';
const jwksUrl=`https://${team}/cdn-cgi/access/certs`;
const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keyPair.publicKey);jwk.kid='security-next-fixture';
const base64url=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const issuedAt=Math.floor(Date.now()/1000),header=base64url({alg:'RS256',kid:jwk.kid}),claims=base64url({sub:'synthetic-admin',email:'admin@example.invalid',iss:`https://${team}`,aud:audience,iat:issuedAt,exp:issuedAt+600});
const signingInput=`${header}.${claims}`;
const jwt=`${signingInput}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(signingInput))).toString('base64url')}`;

const originalFetch=globalThis.fetch,unexpectedFetches=[];
globalThis.fetch=async(input)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url===jwksUrl)return Response.json({keys:[jwk]});
  unexpectedFetches.push(url);throw new Error('Unexpected network request in isolated API test');
};

const orderHeader=['訂單時間','姓名','電話','配送方式','地址','到貨日期','配送時段','備註','訂購商品','訂單金額','聯絡方式','社群','付款方式','行號','訂單狀態','付款狀態','訂單UUID','封存時間'];
function uuidFor(index){return `12345678-1234-4123-8123-${String(index).padStart(12,'0')}`;}
function makeOrder(index,{archived=false,uuid=true}={}){
  const row=Array(18).fill('');row[0]='2026-10-02';row[1]=`Fixture order ${index}`;row[2]='0912345678';row[3]='宅配到府';row[4]='Synthetic address';row[5]='2026-10-10';row[6]='上午';row[8]='Fixture item x 1';row[9]='100';row[13]=String(index+1);row[14]='訂單確認中';row[15]='未收費';row[16]=uuid?uuidFor(index):'';row[17]=archived?'2026-10-02T00:00:00Z':'';return row;
}
let orderRows=[orderHeader,...[makeOrder(0,{uuid:false}),...Array.from({length:401},(_,index)=>makeOrder(index+1)),makeOrder(9000,{archived:true})]];
const customerHeader=['姓名','電話','取貨方式','地址','透過什麼聯繫賣家','社交軟體名字','訂單時間','購買項目'];
let customerRows=[
  customerHeader,
  ['Fixture TW local','0912-345-678','宅配到府','Synthetic address','電話','Fixture ID','2026-09-01','Fixture item x 1'],
  ['Fixture TW alias',"'00886(912)345-678",'宅配到府','Synthetic address','電話','Fixture ID','2026-09-02','Fixture item x 2'],
  ['Fixture invalid','09ABC345678','宅配到府','Synthetic address','電話','Fixture ID','2026-09-03','Fixture item x 1'],
  ['Fixture US','+1 415-555-2671','宅配到府','Synthetic address','電話','Fixture ID','2026-09-04','Fixture item x 1'],
  ['Fixture UK','+44 21 5555 2671','宅配到府','Synthetic address','電話','Fixture ID','2026-09-05','Fixture item x 1'],
];
const sheetReads=[],decorated=[],readViewIds=[];
const kvCalls=[],kvValues=new Map();
const cacheKv={
  async get(key){kvCalls.push({method:'get',key});return kvValues.get(key)??null;},
  async put(key,value,options){kvCalls.push({method:'put',key,options});kvValues.set(key,JSON.parse(value));},
  async delete(key){kvCalls.push({method:'delete',key});kvValues.delete(key);},
  async list(options){kvCalls.push({method:'list',prefix:options?.prefix});return {keys:[]};},
};
const database={prepare(){return {bind(){return {first:async()=>({count:1})};}};}};
const prevRows=OrderSheets.prototype.rows,prevLoad=OrderWriteService.prototype.loadReadView,prevDecorate=OrderWriteService.prototype.decorate,prevGetSheet=GoogleSheetsService.prototype.getSheetData;
OrderSheets.prototype.rows=async function(){sheetReads.push(this.sheetName);return orderRows.map(row=>row.slice());};
OrderWriteService.prototype.loadReadView=async function(ids){readViewIds.push([...ids]);};
OrderWriteService.prototype.decorate=async function(row){decorated.push(row[16]||'legacy');return {revision:'a'.repeat(64),priced_items:null,can_edit_items:false,historical:true,operation_pending:false};};
GoogleSheetsService.prototype.getSheetData=async function(sheetName){sheetReads.push(sheetName);if(sheetName!=='security_next_customers')throw new Error('Unexpected sheet in fixture test');return customerRows.map(row=>row.slice());};

const env={
  APP_ENV:'test',ACCESS_TEAM_DOMAIN:team,ACCESS_AUDIENCE:audience,ADMIN_EMAILS:'admin@example.invalid',
  ALLOWED_ORIGINS:origin,ADMIN_WRITE_EMAILS:'admin@example.invalid',ADMIN_DELETE_EMAILS:'admin@example.invalid',ADMIN_PRICING_EMAILS:'admin@example.invalid',
  GOOGLE_SERVICE_ACCOUNT_KEY:'synthetic-key-only',GOOGLE_SHEET_ID:'security-next-fixture-sheet',TEST_SHEET_ID:'security-next-fixture-sheet',PRODUCTION_SHEET_ID:'different-production-sheet',
  ORDER_SHEET_NAME:'security_next_orders',CUSTOMER_SHEET_NAME:'security_next_customers',ORDER_WRITE_READY:'1',CACHE_DURATION:'15',CATALOG_DB:database,CACHE_KV:cacheKv,
};
const headers={'Cf-Access-Jwt-Assertion':jwt,Origin:origin};
const request=async(path,options={})=>app.request(`https://admin.security-next.internal${path}`,{headers,...options},env);

try{
  const first=await request('/api/orders?page_size=200&refresh=1&_=ignored-noise');
  assert.equal(first.status,200);
  const firstBody=await first.json();assert.equal(firstBody.success,true);assert.equal(firstBody.data.length,200);
  assert.equal(firstBody.pagination.total,402);assert.equal(firstBody.pagination.page_size,200);assert.equal(firstBody.pagination.snapshot_revision.length,64);assert.ok(firstBody.pagination.next_cursor);
  assert.equal(firstBody.data[0].id,'legacy-0');assert.equal(firstBody.data[0].can_manage,false);
  const tokenData=JSON.parse(Buffer.from(firstBody.pagination.next_cursor,'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(tokenData).sort(),['offset','page_size','scope_hash','snapshot_revision','v']);
  assert.equal(tokenData.v,1);assert.equal(tokenData.offset,200);assert.equal(tokenData.page_size,200);
  assert.equal(tokenData.scope_hash.length,64);assert.equal(tokenData.snapshot_revision,firstBody.pagination.snapshot_revision);
  assert.ok(!firstBody.pagination.next_cursor.includes('Fixture')&&!firstBody.pagination.next_cursor.includes('0912345678'));
  assert.equal(first.headers.get('Cache-Control'),'no-store');

  const second=await request(`/api/get_orders_from_sheet.php?page_size=200&cursor=${encodeURIComponent(firstBody.pagination.next_cursor)}`);
  assert.equal(second.status,200,'The existing read alias uses the same cursor contract');
  const secondBody=await second.json();assert.equal(secondBody.data.length,200);assert.equal(secondBody.pagination.snapshot_revision,firstBody.pagination.snapshot_revision);assert.ok(secondBody.pagination.next_cursor);
  const third=await request(`/api/orders?page_size=200&cursor=${encodeURIComponent(secondBody.pagination.next_cursor)}`);
  assert.equal(third.status,200);const thirdBody=await third.json();assert.equal(thirdBody.data.length,2);assert.equal(thirdBody.pagination.next_cursor,null);
  const allIds=[...firstBody.data,...secondBody.data,...thirdBody.data].map(row=>row.id);assert.equal(allIds.length,402);assert.equal(new Set(allIds).size,402);
  assert.deepEqual(readViewIds.map(ids=>ids.length),[199,200,2],'D1 decoration is loaded only for current page UUIDs');assert.equal(decorated.length,402);
  assert.ok(sheetReads.slice(0,3).every(name=>name==='security_next_orders'),'Non-production order reads use the fixture tab');

  const canonicalDefault=await request('/api/orders');assert.equal(canonicalDefault.status,200);
  const canonicalDefaultBody=await canonicalDefault.json();assert.equal(canonicalDefaultBody.data.length,200);assert.equal(canonicalDefaultBody.pagination.page_size,200);
  assert.ok(canonicalDefaultBody.pagination.next_cursor,'Canonical reads keep paginated defaults');

  const originalOrderRows=orderRows;
  orderRows=[orderHeader,...Array.from({length:18},(_,index)=>makeOrder(30000+index))];
  const legacySmall=await request('/api/get_orders_from_sheet.php?v=1.2');assert.equal(legacySmall.status,200);
  const legacySmallBody=await legacySmall.json();assert.equal(legacySmallBody.data.length,18,'An old alias without pagination parameters receives every row');
  assert.equal(Object.hasOwn(legacySmallBody,'pagination'),false,'The compatibility response does not claim to be page 200/500');

  orderRows=[orderHeader,...Array.from({length:501},(_,index)=>makeOrder(40000+index))];
  const legacyTooLarge=await request('/api/get_orders_from_sheet.php?v=1.2');assert.equal(legacyTooLarge.status,503);
  assert.deepEqual(await legacyTooLarge.json(),{success:false,code:'LEGACY_CLIENT_RELOAD_REQUIRED',message:'訂單筆數超過舊版頁面安全上限，請重新整理新版後台使用分頁'});
  orderRows=originalOrderRows;

  const maxPage=await request('/api/orders?page_size=500');assert.equal(maxPage.status,200);const maxBody=await maxPage.json();assert.equal(maxBody.data.length,402);assert.equal(maxBody.pagination.next_cursor,null);
  for(const path of ['/api/orders?page_size=501','/api/orders?page_size=abc','/api/orders?cursor=invalid']){
    const bad=await request(path);assert.equal(bad.status,400,path);
  }
  const pageSizeMismatch=await request(`/api/orders?page_size=100&cursor=${encodeURIComponent(firstBody.pagination.next_cursor)}`);
  assert.equal(pageSizeMismatch.status,400);assert.equal((await pageSizeMismatch.json()).code,'INVALID_ORDER_CURSOR');
  const tampered={...tokenData,scope_hash:'0'.repeat(64)},tamperedCursor=Buffer.from(JSON.stringify(tampered)).toString('base64url');
  const scopeMismatch=await request(`/api/orders?page_size=200&cursor=${tamperedCursor}`);
  assert.equal(scopeMismatch.status,400);assert.equal((await scopeMismatch.json()).code,'INVALID_ORDER_CURSOR');

  const decorationsBeforeExpiry=decorated.length;orderRows[1][9]='changed synthetic amount';
  const expired=await request(`/api/orders?page_size=200&cursor=${encodeURIComponent(firstBody.pagination.next_cursor)}`);
  assert.equal(expired.status,409);assert.deepEqual(await expired.json(),{success:false,code:'ORDER_PAGE_EXPIRED',message:'訂單資料已更新，請重新載入'});assert.equal(decorated.length,decorationsBeforeExpiry);

  orderRows[1][9]='100';const duplicate=makeOrder(1,{archived:true});orderRows.push(duplicate);
  const duplicateResponse=await request('/api/orders?page_size=200');assert.equal(duplicateResponse.status,409);assert.equal((await duplicateResponse.json()).code,'DUPLICATE_ORDER_UUID');
  orderRows.pop();

  const customers=await request('/api/customers');assert.equal(customers.status,200);const customerBody=await customers.json();
  assert.equal(customerBody.data.length,5,'Customer list remains per source row and is not deduplicated');
  assert.equal(customerBody.data[0].phone,'0912-345-678','Stored phone display remains unchanged');
  assert.equal(customerBody.data[0].normalized_phone,'+886912345678');assert.equal(customerBody.data[1].normalized_phone,'+886912345678');assert.equal(customerBody.data[2].normalized_phone,null,'Malformed historic phone stays visible but is not matched');
  assert.equal(customerBody.data[3].normalized_phone,'+14155552671');assert.equal(customerBody.data[4].normalized_phone,'+442155552671');
  assert.ok(sheetReads.includes('security_next_customers'),'Customer reads use the fixture tab');
  assert.equal(kvCalls.length,0,'Active customer list and history endpoints never touch KV');

  const twQuery=new URLSearchParams({phone:'+886 912-345-678'}).toString();
  const twHistory=await request(`/api/customers/orders?${twQuery}`);assert.equal(twHistory.status,200);const twHistoryBody=await twHistory.json();
  assert.deepEqual(twHistoryBody.data.map(item=>item.name).sort(),['Fixture TW alias','Fixture TW local']);
  const usHistory=await request(`/api/customers/orders?${new URLSearchParams({phone:'+1 415-555-2671'})}`);assert.equal(usHistory.status,200);assert.deepEqual((await usHistory.json()).data.map(item=>item.name),['Fixture US']);
  const ukHistory=await request(`/api/customers/orders?${new URLSearchParams({phone:'+44 21 5555 2671'})}`);assert.equal(ukHistory.status,200);assert.deepEqual((await ukHistory.json()).data.map(item=>item.name),['Fixture UK'],'Numbers with the same last nine digits do not cross-match countries');
  const customerReadsBeforeInvalid=sheetReads.filter(name=>name==='security_next_customers').length;
  const invalidPhone=await request(`/api/customers/orders?${new URLSearchParams({phone:'abc0912345678'})}`);assert.equal(invalidPhone.status,400);assert.equal((await invalidPhone.json()).code,'INVALID_PHONE_IDENTITY');
  assert.equal(sheetReads.filter(name=>name==='security_next_customers').length,customerReadsBeforeInvalid,'Invalid phone is rejected before Sheets reads');
  assert.equal(kvCalls.length,0,'Neither active customer endpoint reads/writes raw-phone KV entries');

  const dashboard=await request('/api/admin/dashboard');assert.equal(dashboard.status,200);
  assert.ok(kvCalls.some(call=>call.method==='get'&&call.key==='admin_dashboard_v2'));
  const dashboardWrite=kvCalls.find(call=>call.method==='put'&&call.key==='admin_dashboard_v2');assert.ok(dashboardWrite);assert.equal(dashboardWrite.options.expirationTtl,600);
  const cachedDashboard=kvValues.get('admin_dashboard_v2');assert.equal(cachedDashboard.ttl,300);
  const cachedDashboardText=JSON.stringify(cachedDashboard.data);assert.ok(!cachedDashboardText.includes('Fixture TW')&&!cachedDashboardText.includes('0912-345-678'));

  const cacheValues=new Map(),cacheWrites=[],cacheDeletes=[];
  const cacheKv={async get(key){return cacheValues.has(key)?cacheValues.get(key):null;},async put(key,value,options){cacheWrites.push({key,options});cacheValues.set(key,JSON.parse(value));},async delete(key){cacheDeletes.push(key);},async list(){return {keys:[]};}};
  const cache=new CacheService(cacheKv,15),now=Date.now();
  for(const value of [
    {success:true,data:'legacy-format'},
    {data:{value:'missing ttl'},timestamp:now},
    {data:{value:'bad timestamp'},timestamp:'yesterday',ttl:15},
    {data:{value:'future timestamp'},timestamp:now+60_000,ttl:15},
  ]){
    cacheValues.set('fixture:invalid',value);assert.equal(await cache.get('fixture:invalid'),null);assert.equal((await cache.getStatus('fixture:invalid')).exists,false);
  }
  cacheValues.set('fixture:expired',{data:{value:'expired'},timestamp:now-20_000,ttl:15});assert.equal(await cache.get('fixture:expired'),null);
  cacheValues.set('fixture:fresh',{data:{value:'fresh'},timestamp:now-1_000,ttl:15});assert.deepEqual(await cache.get('fixture:fresh'),{value:'fresh'});
  assert.equal(cacheDeletes.length,0,'Invalid legacy values are rejected without accessing/deleting any raw-phone key');
  await cache.set('fixture:summary',{total:5},300);assert.equal(cacheValues.get('fixture:summary').ttl,300);assert.equal(cacheWrites[0].options.expirationTtl,600);

  const emptyFixture=()=>getSheetNames({APP_ENV:'test',ORDER_SHEET_NAME:undefined,CUSTOMER_SHEET_NAME:undefined});
  assert.throws(emptyFixture,error=>error?.code==='TEST_SHEET_FIXTURES_REQUIRED');
  const noSheetFallbackEnv={...env,ORDER_SHEET_NAME:undefined,CUSTOMER_SHEET_NAME:undefined};
  const failClosed=await app.request('https://admin.security-next.internal/api/orders?page_size=200',{headers},noSheetFallbackEnv);
  assert.equal(failClosed.status,503);assert.equal((await failClosed.json()).code,'TEST_SHEET_FIXTURES_REQUIRED');

  assert.deepEqual(unexpectedFetches,[],'Only the mocked Access JWKS endpoint is contacted');
  console.log('PASS: isolated Admin API verifies versioned paging/cursor expiry, complete UUID collision scan, staging sheet fail-closed names, E.164 phone matching, no PII KV access, strict cache envelopes, and aggregate dashboard cache v2. Google Sheets/D1/KV are fully mocked.');
}finally{
  globalThis.fetch=originalFetch;
  OrderSheets.prototype.rows=prevRows;OrderWriteService.prototype.loadReadView=prevLoad;OrderWriteService.prototype.decorate=prevDecorate;GoogleSheetsService.prototype.getSheetData=prevGetSheet;
  fs.rmSync(temporary,{recursive:true,force:true});
}
