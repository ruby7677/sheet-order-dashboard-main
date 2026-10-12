import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createRequire}from 'node:module';import {pathToFileURL,fileURLToPath}from 'node:url';import {createSQLiteTestDatabase}from './sqlite-d1-adapter.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),r=createRequire(path.join(root,'node_modules','wrangler','package.json'));
const tempBase=path.resolve(os.tmpdir()),tempDir=fs.mkdtempSync(path.join(tempBase,'lopokao-order-management-'));
const tempPrefix=(tempBase.endsWith(path.sep)?tempBase:tempBase+path.sep).toLowerCase();
if(!path.resolve(tempDir).toLowerCase().startsWith(tempPrefix))throw new Error('Unsafe temporary directory');
const bundle=path.join(tempDir,'order-test-bundle.mjs'),entry=path.join(tempDir,'order-test-entry.ts');
let db;
try{
fs.writeFileSync(entry,`export * from ${JSON.stringify(path.join(root,'src/services/OrderContract.ts'))};export * from ${JSON.stringify(path.join(root,'src/services/OrderWriteService.ts'))};export * from ${JSON.stringify(path.join(root,'src/services/CatalogService.ts'))};`);
r('esbuild').buildSync({entryPoints:[entry],outfile:bundle,bundle:true,format:'esm',platform:'browser',nodePaths:[path.join(root,'node_modules')]});
const {rowRevision,mutation,OrderWriteService,CatalogService}=await import(pathToFileURL(bundle));
db=createSQLiteTestDatabase();const rows=[],calls=[];let mode='normal';
const store={rows:async()=>rows,locate:async id=>{const x=rows.find(r=>r[16]===id);if(!x)throw Error('Fixture missing');return [...x];},write:async(id,fields)=>{calls.push({id,fields});if(mode==='timeout-before')throw Error('Fixture timeout');const row=rows.find(r=>r[16]===id);row[7]='Concurrent staff note';for(const [k,v]of Object.entries(fields))row[Number(k)]=String(v);if(mode==='timeout-after')throw Error('Fixture timeout after commit');}};
const service=new OrderWriteService(db,store),catalog=new CatalogService(db),actor='admin@example.invalid';
const makeRow=(id,name='Fixture')=>{const row=Array(18).fill('');Object.assign(row,{0:'fixture',1:name,2:'0900000000',3:'宅配到府',7:'Original note',8:'Fixture x 1',9:'200',14:'訂單確認中',16:id});rows.push(row);return row;};
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),end=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);
async function tracked(){const id=crypto.randomUUID(),snapshot=await catalog.snapshot();await catalog.reserve({id,fingerprint:'a'.repeat(64),revision:snapshot.revision,products:{one:1},preferred_date:today,delivery_method:'宅配到府',shipping:100,total_amount:200});await catalog.transition(id,'a'.repeat(64),'confirmed');return makeRow(id);}
async function request(row,kind,extra={}){return {id:row[16],expected_revision:await rowRevision(row),operation_id:crypto.randomUUID(),kind,...extra};}
const quantity=async()=> (await catalog.snapshot()).products[0].stock_quantity;
try{
 for(const file of ['0001_catalog.sql','0002_order_operations.sql']){const s=fs.readFileSync(path.join(root,'migrations',file),'utf8');for(const sql of s.split(/;\s*(?=CREATE |$)/).filter(s=>s.trim()))await db.prepare(sql).run();}
 const payload={products:[{id:'one',name:'Fixture',price:100,stock_quantity:30,stock_status:'available',is_active:true}],delivery:{delivery_period:{start_date:today,end_date:end},delivery_rules:{home_delivery:{exclude_sunday:false,advance_days:0},store_pickup:{exclude_sunday:false,advance_days:0}}}};
 await db.prepare('INSERT INTO catalog_state VALUES(1,1,?,?,1)').bind(JSON.stringify(payload),new Date().toISOString()).run();
 const row=await tracked(),oldHash=await rowRevision(row);row[7]='Edited directly in Sheet';assert.equal(await rowRevision(row),oldHash,'Notes are deliberately excluded from mutation revision');
 const grow=await request(row,'items',{items:[{product_id:'one',quantity:2}]});const before=await quantity();const result=await service.mutate(grow,actor);assert.equal(result.total,300);assert.equal(row[7],'Concurrent staff note');assert.equal(await quantity(),before-1);assert.ok((await service.mutate(grow,actor)).reused);assert.equal(await quantity(),before-1,'Replay does not deduct again');
 await assert.rejects(()=>service.mutate({...grow,operation_id:crypto.randomUUID()},actor),e=>e.code==='STALE_ORDER');
 const cancel=await request(row,'status',{status:'取消訂單'}),q=await quantity();await service.mutate(cancel,actor);assert.equal(await quantity(),q+2);await service.mutate(cancel,actor);assert.equal(await quantity(),q+2,'Cancellation returns allocation once');
 const remove=await request(row,'delete');await service.mutate(remove,actor);assert.ok(row[17]);assert.equal(await quantity(),q+2,'Deleting cancelled order does not return twice');
 const historical=makeRow(crypto.randomUUID()),h=await request(historical,'status',{status:'取消訂單'}),qh=await quantity();assert.ok((await service.mutate(h,actor)).warning);assert.equal(await quantity(),qh,'Historical original stock is never guessed');
 const shipped=await tracked();await service.mutate(await request(shipped,'status',{status:'已出貨'}),actor);await service.mutate(await request(shipped,'status',{status:'已抄單'}),actor);const qs=await quantity();await service.mutate(await request(shipped,'status',{status:'取消訂單'}),actor);assert.equal(await quantity(),qs,'Previously shipped order never restores stock by status downgrade');
 const uncertain=await tracked();const change=await request(uncertain,'items',{items:[{product_id:'one',quantity:2}]});mode='timeout-after';const qu=await quantity();await assert.rejects(()=>service.mutate(change,actor),e=>e.code==='ORDER_RECONCILIATION_REQUIRED');assert.equal(await quantity(),qu-1);const count=calls.length;mode='normal';await service.mutate(change,actor);assert.equal(calls.length,count,'Known post-write timeout resumes without another write');assert.equal(await quantity(),qu-1);
 const missing=await tracked();const attempted=await request(missing,'items',{items:[{product_id:'one',quantity:2}]});mode='timeout-before';await assert.rejects(()=>service.mutate(attempted,actor));const qm=await quantity();mode='normal';await assert.rejects(()=>service.mutate(attempted,actor),e=>e.code==='ORDER_RECONCILIATION_REQUIRED');assert.equal(await quantity(),qm,'Unknown outcome remains held');await db.prepare("UPDATE order_operations SET created_at=? WHERE id=?").bind(new Date(Date.now()-700000).toISOString(),attempted.operation_id).run();await service.reconcile(attempted.operation_id,actor,'abandon','Fixture verified unchanged');assert.equal(await quantity(),qm+1,'Verified abandonment returns only extra held units');
 const legacy=makeRow(crypto.randomUUID());await service.mutate(await request(legacy,'pricing',{prices:[{product:'Fixture',product_id:'one',unit_price:100}],shipping:100,reason:'Confirmed original receipt'}),actor);await service.mutate(await request(legacy,'items',{items:[{product_id:'one',quantity:2}]}),actor);const ql=await quantity();await service.mutate(await request(legacy,'status',{status:'取消訂單'}),actor);assert.equal(await quantity(),ql+1,'Only proven later additions to historical order are returned');
 const concurrency=await tracked(),version=await rowRevision(concurrency);const outcomes=await Promise.allSettled([service.mutate({id:concurrency[16],operation_id:crypto.randomUUID(),expected_revision:version,kind:'payment',status:'已收費'},actor),service.mutate({id:concurrency[16],operation_id:crypto.randomUUID(),expected_revision:version,kind:'status',status:'已抄單'},actor)]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1,'Concurrent stale-screen mutations have only one winner');

 const currentCatalog=await catalog.snapshot(),two={id:'two',name:'Second Fixture',price:150,stock_quantity:10,stock_status:'available',is_active:true};
 await db.prepare('UPDATE catalog_state SET payload=?,revision=revision+1,updated_at=? WHERE id=1').bind(JSON.stringify({products:[...currentCatalog.products,two],delivery:currentCatalog.delivery}),new Date().toISOString()).run();
 const formattedHistory=makeRow(crypto.randomUUID());formattedHistory[8]='Fixture×1，Second Fixture x1';formattedHistory[9]='350';const originalRawItems=formattedHistory[8];
 const formattedPricing=await request(formattedHistory,'pricing',{prices:[{product:'Fixture',product_id:'one',unit_price:100},{product:'Second Fixture',product_id:'two',unit_price:150}],shipping:100,reason:'Fixture receipt checked'});
 await service.mutate(formattedPricing,actor);assert.equal(formattedHistory[8],originalRawItems,'Pricing initialization preserves original I text');
 const formattedView=await service.decorate(formattedHistory);assert.equal(formattedView.operation_pending,false);assert.equal(formattedView.historical,true);assert.deepEqual(formattedView.priced_items.map(item=>[item.product,item.quantity]),[['Fixture',1],['Second Fixture',1]]);
 const wrongQuantity=[...formattedHistory];wrongQuantity[8]='Fixture×2，Second Fixture x1';await assert.rejects(()=>service.proof(formattedHistory[16],wrongQuantity),error=>error.code==='INVENTORY_PROOF_CONFLICT');
 const wrongAmount=[...formattedHistory];wrongAmount[9]='351';await assert.rejects(()=>service.proof(formattedHistory[16],wrongAmount),error=>error.code==='INVENTORY_PROOF_CONFLICT');
 await service.mutate(await request(formattedHistory,'payment',{status:'已收費'}),actor);assert.equal(formattedHistory[8],originalRawItems,'Payment mutation preserves noncanonical I text');
 const beforeFormattedItems=await quantity();const formattedItems=await request(formattedHistory,'items',{items:[{product_id:'one',quantity:2},{product_id:'two',quantity:1}]});const formattedResult=await service.mutate(formattedItems,actor);
 assert.equal(formattedResult.total,350);assert.equal(formattedHistory[8],'Fixture x 2, Second Fixture x 1');assert.equal(await quantity(),beforeFormattedItems-1,'Item adjustment reserves only its added quantity');
 const duplicateHistory=makeRow(crypto.randomUUID());duplicateHistory[8]='Fixture×1，Fixture x1';duplicateHistory[9]='300';const duplicateHistoryInput=await request(duplicateHistory,'pricing',{prices:[{product:'Fixture',product_id:'one',unit_price:100}],shipping:100,reason:'Duplicate fixture check'}),duplicateWrites=calls.length;
 await assert.rejects(()=>service.mutate(duplicateHistoryInput,actor),error=>error.code==='DUPLICATE_HISTORICAL_ITEM');
 assert.equal(calls.length,duplicateWrites);assert.equal(await db.prepare('SELECT id FROM order_operations WHERE id=?').bind(duplicateHistoryInput.operation_id).first(),null,'Duplicate historical SKU initialization creates no operation journal');assert.equal(duplicateHistory[8],'Fixture×1，Fixture x1');

 const lostPrepare=await tracked(),lostPrepareMutation=await request(lostPrepare,'items',{items:[{product_id:'one',quantity:2}]}),stockBeforeLostPrepare=await quantity(),writesBeforeLostPrepare=calls.length;
 const orderCommit=service.catalog.orderCommit;let losePrepareResponse=true;
 service.catalog.orderCommit=async function(...args){await orderCommit.apply(this,args);if(losePrepareResponse&&args[2]===lostPrepareMutation.operation_id){losePrepareResponse=false;throw new Error('Simulated lost D1 commit response');}};
 await assert.rejects(()=>service.mutate(lostPrepareMutation,actor),error=>error.code==='ORDER_OPERATION_RESULT_UNKNOWN'&&error.status===503);
 service.catalog.orderCommit=orderCommit;
 assert.equal(await quantity(),stockBeforeLostPrepare-1,'Unknown successful prepare reserves stock once');assert.equal(calls.length,writesBeforeLostPrepare,'Unknown prepare does not write Sheets before replay');
 const lostJournal=await db.prepare('SELECT id,phase FROM order_operations WHERE id=?').bind(lostPrepareMutation.operation_id).first();assert.equal(lostJournal?.id,lostPrepareMutation.operation_id);assert.equal(lostJournal?.phase,'prepared','Unknown prepare keeps its operation identity pending');
 const writeCountBeforeReplay=calls.length;assert.equal((await service.mutate(lostPrepareMutation,actor)).success,true);assert.equal(calls.length,writeCountBeforeReplay+1);assert.equal(await quantity(),stockBeforeLostPrepare-1,'Replay completes without a second stock reservation');
 const completedLostJournal=await db.prepare('SELECT phase FROM order_operations WHERE id=?').bind(lostPrepareMutation.operation_id).first();assert.equal(completedLostJournal?.phase,'completed');const completedWriteCount=calls.length;assert.ok((await service.mutate(lostPrepareMutation,actor)).reused);assert.equal(calls.length,completedWriteCount);assert.equal(await quantity(),stockBeforeLostPrepare-1,'Completed replay has no duplicate effects');

 const lostRead=await tracked();
 const lostReadMutation=await request(lostRead,'items',{items:[{product_id:'one',quantity:2}]});
 const stockBeforeLostRead=await quantity();
 const originalOperation=service.operation.bind(service);let failOperationRead=false,loseReadPrepareResponse=true;
 service.operation=async id=>{if(failOperationRead){failOperationRead=false;throw new Error('Simulated operation read failure');}return originalOperation(id);};
 service.catalog.orderCommit=async function(...args){await orderCommit.apply(this,args);if(loseReadPrepareResponse&&args[2]===lostReadMutation.operation_id){loseReadPrepareResponse=false;failOperationRead=true;throw new Error('Simulated lost D1 commit response');}};
 await assert.rejects(()=>service.mutate(lostReadMutation,actor),error=>error.code==='ORDER_OPERATION_RESULT_UNKNOWN'&&error.status===503);
 service.operation=originalOperation;service.catalog.orderCommit=orderCommit;
 assert.equal(await quantity(),stockBeforeLostRead-1,'Unreadable commit result still holds the single stock reservation');assert.equal((await db.prepare('SELECT id FROM order_operations WHERE id=?').bind(lostReadMutation.operation_id).first())?.id,lostReadMutation.operation_id);
 const readRecoveryWrites=calls.length;await service.mutate(lostReadMutation,actor);assert.equal(calls.length,readRecoveryWrites+1);assert.equal(await quantity(),stockBeforeLostRead-1,'Same identity replay recovers after operation lookup failure');assert.ok((await service.mutate(lostReadMutation,actor)).reused);

 const rejectedStock=await tracked(),rejectedMutation=await request(rejectedStock,'items',{items:[{product_id:'one',quantity:2}]});
 const stockSnapshot=await catalog.snapshot(),zeroStock={...stockSnapshot.products[0],stock_quantity:0};
 await db.prepare('UPDATE catalog_state SET payload=?,revision=revision+1,updated_at=? WHERE id=1').bind(JSON.stringify({products:[zeroStock],delivery:stockSnapshot.delivery}),new Date().toISOString()).run();
 const stockBeforeReject=await quantity(),writesBeforeReject=calls.length;
 await assert.rejects(()=>service.mutate(rejectedMutation,actor),error=>error.code==='ORDER_STOCK_REJECTED'&&error.status===409&&error.message==='商品停售或庫存不足');
 assert.equal(await quantity(),stockBeforeReject,'Rejected stock mutation does not change inventory');assert.equal(calls.length,writesBeforeReject,'Rejected stock mutation does not write Sheets');
 assert.equal(await db.prepare('SELECT id FROM order_operations WHERE id=?').bind(rejectedMutation.operation_id).first(),null,'Rejected stock mutation leaves no operation journal');
 const reducedRetry=await request(rejectedStock,'items',{items:[{product_id:'one',quantity:1}]});assert.notEqual(reducedRetry.operation_id,rejectedMutation.operation_id);assert.equal((await service.mutate(reducedRetry,actor)).success,true,'A fresh reduced intent can proceed after the rejected intent is cleared');assert.equal(await quantity(),stockBeforeReject);
 assert.equal(mutation.safeParse({...await request(concurrency,'items'),items:[{product_id:'one',quantity:1.5}]}).success,false);assert.equal(mutation.safeParse({...await request(concurrency,'payment'),status:'=1+1'}).success,false);
 assert.ok(calls.every(c=>!Object.prototype.hasOwnProperty.call(c.fields,'7')),'No mutation overwrites Sheet notes');await service.loadReadView(rows.map(r=>r[16]));assert.ok((await service.decorate(concurrency)).revision);
 console.log('PASS: SQLite order journals, stock rejection without a journal, ambiguous prepare and journal-read failures with same-ID replay, single stock reservation, notes preservation, stale/concurrent rejection, shipped/historical restock policy and contract limits. Mock Sheets only; no production or messages.');
}finally{db.close();}
}finally{
 const target=path.resolve(tempDir);
 if(target.toLowerCase().startsWith(tempPrefix)){const info=fs.lstatSync(target);if(info.isDirectory()&&!info.isSymbolicLink())fs.rmSync(target,{recursive:true,force:true});}
}
