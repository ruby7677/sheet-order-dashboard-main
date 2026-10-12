import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const apiRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(apiRoot,'node_modules','wrangler','package.json'));
const esbuild=require('esbuild');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lopokao-gateway-errors-'));
const entry=path.join(tmp,'entry.ts'),output=path.join(tmp,'worker.mjs');
fs.writeFileSync(entry,`export {default as app} from ${JSON.stringify(path.join(apiRoot,'src/index.ts'))};\nexport {checkoutGateway,catalogVersionDiagnostic,CheckoutGatewayError} from ${JSON.stringify(path.join(apiRoot,'src/services/CheckoutGateway.ts'))};\n`);
await esbuild.build({entryPoints:[entry],outfile:output,bundle:true,platform:'browser',format:'esm',nodePaths:[path.join(apiRoot,'node_modules')]});
const {app,checkoutGateway,catalogVersionDiagnostic}=await import(pathToFileURL(output).href);

const team='767780.cloudflareaccess.com',audience='acba9bfaa5b6ea9abaac4bfd10b052aba1c0cec6a99166d995f5f95353099438';
const origin='https://sheet-order-dashboard-main.pages.dev',jwksUrl=`https://${team}/cdn-cgi/access/certs`;
const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keyPair.publicKey);jwk.kid='gateway-diagnostic-test';
const b64url=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const now=Math.floor(Date.now()/1000),head=b64url({alg:'RS256',kid:jwk.kid}),claims=b64url({sub:'fixture-admin',email:'ruby7677@gmail.com',iss:`https://${team}`,aud:audience,iat:now,exp:now+600});
const signingInput=`${head}.${claims}`;
const jwt=`${signingInput}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(signingInput))).toString('base64url')}`;

const priorFetch=globalThis.fetch,priorConsoleError=console.error;
const unexpectedFetches=[],gatewayRequests=[],safeLogs=[];
globalThis.fetch=async(input)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url===jwksUrl)return Response.json({keys:[jwk]});
  unexpectedFetches.push(url);throw new Error('unexpected network request');
};
console.error=(...values)=>safeLogs.push(values.map(String).join(' '));
const database={prepare(){return {bind(){return {first:async()=>({count:1})};}};}};
const env={APP_ENV:'production',ACCESS_TEAM_DOMAIN:team,ACCESS_AUDIENCE:audience,ADMIN_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ALLOWED_ORIGINS:origin,ADMIN_WRITE_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ADMIN_DELETE_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',ADMIN_PRICING_EMAILS:'ruby7677@gmail.com,wade7616@gmail.com',CATALOG_DB:database};
const adminHeaders={'Cf-Access-Jwt-Assertion':jwt,Origin:origin};
const adminRequest=(path,config,headers=adminHeaders)=>app.request(`https://admin.internal${path}`,{headers},config);
const expectGatewayError=async(promise,code,status)=>await assert.rejects(promise,error=>error?.code===code&&error?.status===status);

try{
  await expectGatewayError(checkoutGateway(undefined,jwt,{action:'list'}),'CATALOG_BINDING_MISSING',503);
  await expectGatewayError(checkoutGateway({fetch:async()=>{throw new Error('do-not-log-secret-sentinel');}},jwt,{action:'list'}),'CATALOG_BINDING_FETCH_FAILED',503);
  for(const [status,code] of [[401,'CATALOG_DOWNSTREAM_UNAUTHORIZED'],[503,'CATALOG_DOWNSTREAM_UNAVAILABLE']]){
    await expectGatewayError(checkoutGateway({fetch:async()=>Response.json({success:false},{status})},jwt,{action:'list'}),code,status);
    await expectGatewayError(catalogVersionDiagnostic({fetch:async()=>Response.json({success:false},{status})}),code,status);
  }

  const gatewayResponse=await checkoutGateway({fetch:async(input,init)=>{
    assert.ok(input instanceof Request);assert.equal(new URL(input.url).origin,'https://catalog.example.com');
    assert.equal(input.redirect,'manual');assert.deepEqual(Object.keys(Object.fromEntries(input.headers.entries())).sort(),['cf-access-jwt-assertion','content-type']);
    assert.equal(input.headers.get('cf-access-jwt-assertion'),jwt);
    assert.equal(init,undefined);gatewayRequests.push({path:new URL(input.url).pathname,body:await input.clone().text()});
    return Response.json({success:true,data:{fixture:true}});
  }},jwt,{action:'list'});
  assert.deepEqual(gatewayResponse,{fixture:true});
  await expectGatewayError(checkoutGateway({fetch:async()=>Response.redirect('https://outside.example/steal',302)},jwt,{action:'list'}),'CATALOG_DOWNSTREAM_REDIRECT_REJECTED',503);
  const followedResponse=Response.json({success:true,data:{fixture:true}});
  Object.defineProperty(followedResponse,'redirected',{value:true});
  await expectGatewayError(checkoutGateway({fetch:async()=>followedResponse},jwt,{action:'list'}),'CATALOG_DOWNSTREAM_REDIRECT_REJECTED',503);

  const versionCalls=[];
  const versionBinding={fetch:async(input,init)=>{
    assert.ok(input instanceof URL);assert.equal(input.href,'https://catalog.example.com/public/version');
    assert.deepEqual(init,{method:'GET',redirect:'manual'});versionCalls.push(input.href);
    return Response.json({success:true,revision:17});
  }};
  assert.deepEqual(await catalogVersionDiagnostic(versionBinding),{status:200,revision:17});
  await expectGatewayError(catalogVersionDiagnostic({fetch:async()=>Response.redirect('https://outside.example/steal',302)}),'CATALOG_DOWNSTREAM_REDIRECT_REJECTED',503);

  const unauthenticated=await adminRequest('/api/checkouts/catalog-health',env,{'Origin':origin});
  assert.equal(unauthenticated.status,401,'Read-only Catalog diagnostic remains behind Admin Access');
  assert.equal(versionCalls.length,1,'Unauthenticated requests cannot invoke the service binding');

  const reachable=await adminRequest('/api/checkouts/catalog-health',{...env,CATALOG_API:versionBinding});
  assert.equal(reachable.status,200);assert.deepEqual(await reachable.json(),{success:true,data:{status:200,revision:17}});

  const rejectBinding={fetch:async()=>{throw new Error('do-not-log-secret-sentinel');}};
  const pendingFailure=await adminRequest('/api/checkouts/pending',{...env,CATALOG_API:rejectBinding});
  assert.equal(pendingFailure.status,503);assert.equal((await pendingFailure.json()).code,'CATALOG_BINDING_FETCH_FAILED');
  const diagnosticFailure=await adminRequest('/api/checkouts/catalog-health',{...env,CATALOG_API:rejectBinding});
  assert.equal(diagnosticFailure.status,503);assert.equal((await diagnosticFailure.json()).code,'CATALOG_BINDING_FETCH_FAILED');

  for(const [status,code] of [[401,'CATALOG_DOWNSTREAM_UNAUTHORIZED'],[503,'CATALOG_DOWNSTREAM_UNAVAILABLE']]){
    const response=await adminRequest('/api/checkouts/catalog-health',{...env,CATALOG_API:{fetch:async()=>Response.json({success:false},{status})}});
    assert.equal(response.status,status);assert.equal((await response.json()).code,code);
  }

  const missingBinding=await adminRequest('/api/checkouts/catalog-health',env);
  assert.equal(missingBinding.status,503);assert.equal((await missingBinding.json()).code,'CATALOG_BINDING_MISSING');
  assert.ok(safeLogs.length>=5);
  assert.ok(safeLogs.every(line=>line.includes('checkout_gateway_failure')&&!line.includes('do-not-log-secret-sentinel')),'Logs contain fixed codes only, never raw fetch errors');
  assert.deepEqual(unexpectedFetches,[],'No direct/public-network fallback is used');
  assert.equal(gatewayRequests[0].path,'/internal/checkout-reconciliation');
  assert.deepEqual(JSON.parse(gatewayRequests[0].body),{action:'list'});
  console.log('PASS: Worker-compatible redirect:manual requests construct successfully; 3xx or redirected responses are rejected before JWT can leave the bound Worker; gateway distinguishes absent binding, binding.fetch rejection, Catalog 401 and 503; authenticated Admin-only public/version probe confirms binding reachability; no raw error or public fallback.');
}finally{
  globalThis.fetch=priorFetch;console.error=priorConsoleError;fs.rmSync(tmp,{recursive:true,force:true});
}
