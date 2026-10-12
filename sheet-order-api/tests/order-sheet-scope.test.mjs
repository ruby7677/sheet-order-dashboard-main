import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'package.json')),tempRoot=path.resolve(os.tmpdir()),temp=fs.mkdtempSync(path.join(tempRoot,'lopokao-sheet-scope-'));
const bundle=path.join(temp,'scope.mjs');
require('esbuild').buildSync({entryPoints:[path.join(root,'src/services/OrderSheets.ts')],bundle:true,format:'esm',platform:'browser',outfile:bundle});
const {OrderSheets}=await import(pathToFileURL(bundle).href);const prev=OrderSheets.prototype.getAccessToken,originalFetch=globalThis.fetch;
OrderSheets.prototype.getAccessToken=async()=> 'synthetic-access-token';
const id='00000000-0000-4000-8000-000000000001',row=Array(18).fill('');row[16]=id;row[7]='synthetic note';
let metadataReads=0,writes=0,hostile=false;
globalThis.fetch=async(input,init)=>{const u=new URL(String(input));assert.equal(u.hostname,'sheets.googleapis.com');if(u.search){metadataReads++;return Response.json({sheets:[{properties:{sheetId:0,title:'Sheet1'}},{properties:{sheetId:777,title:'OtherSheet'}}]});}const body=JSON.parse(init?.body||'{}');const lookup=body.dataFilters?.[0]?.developerMetadataLookup||body.data?.[0]?.dataFilter?.developerMetadataLookup;assert.deepEqual(lookup.metadataLocation,{sheetId:0});assert.equal(lookup.locationMatchingStrategy,'INTERSECTING_LOCATION');assert.equal(lookup.locationType,'ROW');assert.equal(lookup.metadataValue,id);if(u.pathname.endsWith('values:batchGetByDataFilter'))return Response.json({valueRanges:[{valueRange:{range:hostile?'OtherSheet!A2:R2':'Sheet1!A2:R2',values:[row]}}]});if(u.pathname.endsWith('values:batchUpdateByDataFilter')){writes++;assert.equal(body.data[0].values[0][7],null);return Response.json({totalUpdatedRows:1});}throw Error('Unexpected synthetic endpoint');};
try{const store=new OrderSheets('{}','synthetic-sheet-id','Sheet1');assert.equal((await store.locate(id))[16],id);await store.write(id,{15:'已收費'});assert.equal(metadataReads,1,'Selected sheet ID 0 is cached on this request-scoped instance');assert.equal(writes,1);hostile=true;await assert.rejects(store.locate(id),e=>e.code==='ORDER_METADATA_CONFLICT');assert.equal(writes,1);console.log('PASS: metadata reads/writes are scoped to selected Sheet ID including 0, foreign-sheet ranges fail closed, and H is never written. No external calls.');}finally{globalThis.fetch=originalFetch;OrderSheets.prototype.getAccessToken=prev;const resolved=path.resolve(temp);if(!resolved.startsWith(tempRoot+path.sep))throw Error('UNSAFE_TEMP_CLEANUP');fs.rmSync(resolved,{recursive:true,force:true});}
