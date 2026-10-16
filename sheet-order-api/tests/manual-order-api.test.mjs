import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSQLiteTestDatabase} from './sqlite-d1-adapter.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(path.join(root,'node_modules/wrangler/package.json'));
const bundle=path.join(root,'tests/manual-order-api.fixture.mjs');
await require('esbuild').build({stdin:{contents:`export {default as app} from './src/index.ts';export {default as catalog} from './src/catalogWorker.ts';export {manualOrderInputSchema} from './src/services/ManualOrderContract.ts';export {checkoutGateway} from './src/services/CheckoutGateway.ts';`,resolveDir:root},bundle:true,format:'esm',platform:'browser',outfile:bundle});
const {app,catalog,manualOrderInputSchema,checkoutGateway}=await import(pathToFileURL(bundle));
const db=createSQLiteTestDatabase();
for(const name of ['0001_catalog.sql','0002_order_operations.sql'])for(const sql of fs.readFileSync(path.join(root,'migrations',name),'utf8').split(/;\s*(?=CREATE |$)/).filter(s=>s.trim()))await db.prepare(sql).run();
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const payload={products:[{id:'fixture',name:'Synthetic only',price:100,stock_quantity:20,stock_status:'available',is_active:true}],delivery:{delivery_period:{start_date:today,end_date:today},delivery_rules:{home_delivery:{advance_days:0,exclude_sunday:false},store_pickup:{advance_days:0,exclude_sunday:false}}}};
await db.prepare('INSERT INTO catalog_state(id,revision,payload,updated_at,write_ready) VALUES(1,1,?,?,1)').bind(JSON.stringify(payload),new Date().toISOString()).run();
const team='767780.cloudflareaccess.com',aud='acba9bfaa5b6ea9abaac4bfd10b052aba1c0cec6a99166d995f5f95353099438',origin='https://sheet-order-dashboard-main.pages.dev';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='manual-fixture';
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(email){const now=Math.floor(Date.now()/1000),head=encode({alg:'RS256',kid:jwk.kid}),body=encode({sub:'synthetic-admin',email,iss:'https://'+team,aud,iat:now,exp:now+600}),signed=head+'.'+body;return signed+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(signed))).toString('base64url');}
const input={order:{requestId:crypto.randomUUID(),catalogRevision:1,customerName:'Synthetic only',phone:'0900000000',deliveryMethod:'來店自取',district:'',area:'',address:'雲林縣西螺鎮中山路302-3號（戶政事務所跟西光幼稚園中間）',storeName:'',storeAddress:'',storeId:'',preferredDate:today,preferredTime:'不指定',contactMethod:'電話',socialAccount:'',paymentMethod:'銀行轉帳',paymentStatus:'未收費',notes:'',products:{fixture:1},totalAmount:100,shipping:0},send_sms:false};
const rpcCalls=[],secret='a'.repeat(64),originalFetch=globalThis.fetch;
let rpcFailure=false,invalidReceipt=false;globalThis.fetch=async(url,options)=>{if(String(url)==='https://'+team+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});if(String(url)==='https://lopokao.767780.xyz/api/order_reconciliation.php'){const body=JSON.parse(options.body);const headers=new Headers(options.headers);const signed=['POST','/api/order_reconciliation.php',headers.get('X-Service-Time'),headers.get('X-Service-Nonce'),Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(options.body))).toString('hex')].join('\n');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);assert.equal(headers.get('X-Service-Signature'),Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(signed))).toString('hex'));rpcCalls.push(body);if(rpcFailure)return Response.json({success:false,message:'Synthetic conflict',safe_to_restart:false},{status:409});if(body.action==='create_manual')return Response.json({success:true,data:{success:true,order_id:invalidReceipt?crypto.randomUUID():body.order.requestId,sms_sent:false}});if(body.action==='store_search')return Response.json({success:true,data:[{id:'123456',name:'Synthetic store',address:'Synthetic address'}]});throw Error('Unexpected action');}throw Error('Unexpected external call');};
const env={APP_ENV:'production',ACCESS_TEAM_DOMAIN:team,ACCESS_AUDIENCE:aud,ADMIN_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ADMIN_WRITE_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ADMIN_DELETE_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ALLOWED_ORIGINS:origin,CATALOG_DB:db,ORDER_WRITE_READY:'1',MANUAL_ORDER_READY:'1',SERVICE_HMAC_SECRET:secret};
env.CATALOG_API={fetch:request=>catalog.fetch(request,env)};
async function request(email,data=input,extra={}){const jwt=await token(email);return app.request('https://admin.invalid/api/manual-orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','Cf-Access-Jwt-Assertion':jwt},body:JSON.stringify(data)},{...env,...extra});}
try{
 assert(manualOrderInputSchema.safeParse(input).success);assert(!manualOrderInputSchema.safeParse({...input,actor:'forged'}).success);assert(!manualOrderInputSchema.safeParse({...input,order:{...input.order,paymentMethod:'貨到付款',paymentStatus:'已收費'}}).success);
 const legacy={...input,order:{...input.order}};delete legacy.order.paymentStatus;legacy.order.address='';assert(manualOrderInputSchema.safeParse(legacy).success);
 assert.equal((await app.request('https://admin.invalid/api/manual-orders',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(input)},env)).status,401);
 assert.equal((await request('outsider@example.invalid')).status,403);
 assert.equal((await request('ruby7677@gmail.com',input,{ADMIN_WRITE_EMAILS:''})).status,403);
 assert.equal((await request('ruby7677@gmail.com',input,{MANUAL_ORDER_READY:'0'})).status,503);
 assert.equal(rpcCalls.length,0);
 for(const email of ['ruby7677@gmail.com','wade7616@gmail.com']){const r=await request(email);assert.equal(r.status,200);assert.equal((await r.json()).order_id,input.order.requestId);assert.equal(rpcCalls.at(-1).actor,email);assert.equal(rpcCalls.at(-1).send_sms,false);}
 rpcFailure=true;const conflict=await request('ruby7677@gmail.com');assert.equal(conflict.status,409);assert.equal((await conflict.json()).safe_to_restart,false);rpcFailure=false;
 invalidReceipt=true;const uncertain=await request('ruby7677@gmail.com');assert.equal(uncertain.status,503);assert.equal((await uncertain.json()).safe_to_restart,false);invalidReceipt=false;
 const original=rpcCalls.length;await assert.rejects(checkoutGateway(undefined,'token',{action:'create_manual',...input}));assert.equal(rpcCalls.length,original);
 assert.equal((await request('ruby7677@gmail.com',{...input,order:{...input.order,products:{fixture:1.5}}})).status,400);
 console.log('PASS: both administrator JWTs, write permissions, rollout gate, HMAC actor/body binding, opt-out, uncertain conflict, wrong receipt ID and invalid payload rejected. No Google or production writes.');
}finally{globalThis.fetch=originalFetch;db.close();}
