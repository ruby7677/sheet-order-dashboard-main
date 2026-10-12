import {CatalogError,CatalogService} from './CatalogService';
import {OrderSheets} from './OrderSheets';
import {Mutation,InventoryProof,OrderConflict,mutation,rowCells,rowRevision,sheetItems,pricedItems,total,cents,uuid,inventoryChange} from './OrderContract';
import {MAX_OPERATIONS_SNAPSHOT_BYTES,MAX_OPERATIONS_SNAPSHOT_ROWS,paginateOperationsSnapshot} from './OperationsPagination';
import type {OperationsPage} from './OperationsPagination';
interface Operation {id:string;order_id:string;expected_hash:string;fingerprint:string;actor:string;kind:string;before_fields:string;after_fields:string;phase:string;result:string;created_at:string;}
interface Plan {fields:Record<number,string|number>;next:InventoryProof;delta:Record<string,number>;after_hash:string;warning?:string;reason?:string;}
export interface OrderStore {locate(id:string):Promise<string[]>;locateForDelete?(id:string):Promise<string[]>;clearOrder?(id:string):Promise<void>;write(id:string,fields:Record<number,string|number>):Promise<void>;rows():Promise<string[][]>; }
const now=()=>new Date().toISOString();
const aliases:Record<string,string>={radish:'原味蘿蔔糕',taro:'芋頭粿',hongkong:'台式鹹蘿蔔糕'};
const blankRow=(row:string[])=>row.length===18&&row.every(cell=>cell==='');
const hasInventoryDelta=(delta:Record<string,number>)=>Object.values(delta).some(value=>value!==0);
const deleteStockReview=()=>new OrderConflict(409,'DELETE_PLAN_NEEDS_MANUAL_STOCK_REVIEW','舊刪除操作含庫存回補計畫，已停止自動重試；請人工核對庫存與訂單。');
function assertStoredItemStructure(value:string,expected:ReturnType<typeof pricedItems>):void{
 const actual=sheetItems(value);
 if(actual.length!==expected.length)throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','商品明細與庫存核對紀錄不一致，請先對帳');
 const actualNames=new Set<string>(),expectedNames=new Set<string>(),counts=new Map<string,number>();
 for(const item of actual){if(actualNames.has(item.product))throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','商品明細含重複品項，請先對帳');actualNames.add(item.product);const key=JSON.stringify([item.product,item.quantity]);counts.set(key,(counts.get(key)||0)+1);}
 for(const item of expected){if(expectedNames.has(item.product))throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','庫存核對紀錄含重複品項，請先對帳');expectedNames.add(item.product);const key=JSON.stringify([item.product,item.quantity]),count=counts.get(key)||0;if(!count)throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','商品明細與庫存核對紀錄不一致，請先對帳');if(count===1)counts.delete(key);else counts.set(key,count-1);}
 if(counts.size)throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','商品明細與庫存核對紀錄不一致，請先對帳');
}
export class OrderWriteService {
 private catalog:CatalogService;
 private readInventory?:Map<string,string>;
 private readReservations?:Map<string,{id:string;state:string;quantities:string;snapshot:string}>;
 private readPending?:Set<string>;
 constructor(private db:D1Database,private sheets:OrderStore){if(!db)throw new OrderConflict(503,'ORDER_STORAGE_MISSING','訂單管理尚未配置');this.catalog=new CatalogService(db);}
 async proof(id:string,inputRow:string[]):Promise<InventoryProof>{
  const row=rowCells(inputRow);
  const saved=this.readInventory?this.readInventory.get(id):((await this.db.prepare('SELECT proof FROM order_inventory WHERE order_id=?').bind(id).first<{proof:string}>())?.proof);
  if(saved){const proof=JSON.parse(saved) as InventoryProof;if(Object.keys(proof.prices).length){assertStoredItemStructure(row[8],pricedItems(proof));if(cents(row[9])!==cents(total(proof)))throw new OrderConflict(409,'INVENTORY_PROOF_CONFLICT','商品或金額與管理紀錄不一致，請先對帳');}return proof;}
  const reservation=this.readReservations?this.readReservations.get(id):await this.catalog.reservation(id);
  if(!reservation)return {prices:{},quantities:{},allocations:{},historical:true,restored:false,shipping:0,has_shipped:row[14]==='已出貨'};
  if(reservation.state!=='confirmed')throw new OrderConflict(409,'STOCK_CONFIRMATION_PENDING','原下單庫存尚待確認，請先對帳');
  const snapshot=JSON.parse(reservation.snapshot),quantities=JSON.parse(reservation.quantities) as Record<string,number>,prices:InventoryProof['prices']={};
  for(const p of snapshot.products)prices[p.id]={name:aliases[p.id]||p.name,price:p.price};
  const p:InventoryProof={prices,quantities,allocations:{...quantities},historical:false,restored:false,shipping:0,has_shipped:row[14]==='已出貨'};
  const expected=pricedItems(p);assertStoredItemStructure(row[8],expected);
  const sum=expected.reduce((s,i)=>s+cents(i.price)*i.quantity,0);p.shipping=(cents(row[9])-sum)/100;cents(p.shipping);return p;
 }
 private async lease<T>(work:()=>Promise<T>):Promise<T>{
  const token=crypto.randomUUID(),time=Date.now();const won=await this.db.prepare('INSERT INTO order_write_lease(id,token,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<? RETURNING token').bind(token,time+120000,time).first<{token:string}>();
  if(won?.token!==token)throw new OrderConflict(409,'ORDER_WRITE_BUSY','另一筆訂單正在處理，請稍後再試');
  try{return await work();}finally{await this.db.prepare('DELETE FROM order_write_lease WHERE id=1 AND token=?').bind(token).run();}
 }
 private async operation(id:string){return this.db.prepare('SELECT * FROM order_operations WHERE id=?').bind(id).first<Operation>();}
 private async setPhase(id:string,phase:string){await this.db.prepare('UPDATE order_operations SET phase=?,updated_at=? WHERE id=?').bind(phase,now(),id).run();}
 private async plan(input:Mutation,inputRow:string[],before:InventoryProof):Promise<Plan>{
  const row=rowCells(inputRow);
  const fields:Record<number,string|number>={};let next=structuredClone(before),delta:Record<string,number>={},warning:string|undefined;
  if(input.kind==='pricing'){
   if(Object.keys(before.prices).length)throw new OrderConflict(409,'PRICING_ALREADY_CONFIRMED','成交單價已保存，不可重新初始化');
   const configured=await this.catalog.snapshot(),actual=sheetItems(row[8]),actualNames=new Set<string>();next.prices={};next.quantities={};
   for(const item of actual){if(actualNames.has(item.product))throw new OrderConflict(409,'DUPLICATE_HISTORICAL_ITEM','原商品明細含重複商品，請先核對');actualNames.add(item.product);}
   for(const item of input.prices){if(next.prices[item.product_id])throw new OrderConflict(400,'DUPLICATE_PRODUCT','商品不得重複');if(!configured.products.some(p=>p.id===item.product_id))throw new OrderConflict(400,'UNKNOWN_PRODUCT','商品識別不正確');cents(item.unit_price);next.prices[item.product_id]={name:item.product,price:item.unit_price};}
   for(const item of actual){const matches=Object.entries(next.prices).filter(([,p])=>p.name===item.product);if(matches.length!==1)throw new OrderConflict(400,'PRICE_MAPPING_REQUIRED','請逐項確認商品與成交單價');next.quantities[matches[0]![0]]=item.quantity;}
   next.shipping=input.shipping;if(cents(total(next))!==cents(row[9]))throw new OrderConflict(409,'PRICE_TOTAL_MISMATCH','成交單價與運費加總須符合原訂單金額');
  }else{
   ({next,delta,warning}=inventoryChange(before,input,row[14],row[3]));
   if(input.kind==='status')fields[14]=input.status;
   if(input.kind==='payment')fields[15]=input.status;
   if(input.kind==='items'){fields[8]=pricedItems(next).map(i=>`${i.product} x ${i.quantity}`).join(', ');fields[9]=total(next);}
  }
  const updated=input.kind==='delete'?Array(18).fill('') as string[]:rowCells(row);for(const [col,v]of Object.entries(fields))updated[Number(col)]=String(v);
  return {fields,next,delta,after_hash:await rowRevision(updated),warning,...(input.kind==='pricing'?{reason:input.reason}: {})};
 }
 async mutate(raw:unknown,actor:string):Promise<Record<string,unknown>>{
  const parsed=mutation.safeParse(raw);if(!parsed.success)throw new OrderConflict(400,'INVALID_ORDER_MUTATION','操作格式錯誤，請重新載入並確認欄位');const input=parsed.data;
  const fingerprint=await rowRevision([JSON.stringify(input)]);
  if(input.kind==='delete'&&(!this.sheets.locateForDelete||!this.sheets.clearOrder))throw new OrderConflict(503,'ORDER_DELETE_UNAVAILABLE','訂單清除功能尚未配置，沒有變更資料或庫存。');
  return this.lease(async()=>{
   let op=await this.operation(input.operation_id);
   if(op){if(op.actor!==actor||op.order_id!==input.id||op.fingerprint!==fingerprint)throw new OrderConflict(409,'OPERATION_ID_REUSED','操作識別已使用');if(op.phase==='completed')return {...JSON.parse(op.result),reused:true};if(op.phase==='rejected')throw new OrderConflict(409,'OPERATION_REJECTED','此操作已撤回，請重新載入');}
   let row:string[]=[],plan:Plan;
   if(op){
    plan=JSON.parse(op.after_fields);
    if(op.kind==='delete'&&hasInventoryDelta(plan.delta))throw deleteStockReview();
   }else{
    row=rowCells(await this.sheets.locate(input.id));
    const pending=await this.db.prepare("SELECT id FROM order_operations WHERE order_id=? AND phase IN ('prepared','sheet_submitting','pending') LIMIT 1").bind(input.id).first();if(pending)throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','訂單有結果待確認的操作，請先對帳');
    if(row[17])throw new OrderConflict(409,'ORDER_ARCHIVED','訂單已刪除，請重新載入');if(await rowRevision(row)!==input.expected_revision)throw new OrderConflict(409,'STALE_ORDER','訂單已更新，請重新載入後再操作');
    const before=await this.proof(input.id,row);plan=await this.plan(input,row,before);const date=now();
    const negative=Object.fromEntries(Object.entries(plan.delta).filter(([,n])=>n<0));
    try{
     await this.catalog.orderCommit(negative,actor,input.operation_id,[this.db.prepare('INSERT INTO order_operations(id,order_id,expected_hash,fingerprint,actor,kind,before_fields,after_fields,phase,result,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(input.operation_id,input.id,input.expected_revision,fingerprint,actor,input.kind,JSON.stringify({fields:Object.fromEntries(Object.keys(plan.fields).map(c=>[c,row[Number(c)]])),proof:before}),JSON.stringify(plan),'prepared','{}',date,date)]);
    }catch(error){
     let persisted:Operation|null;
     try{persisted=await this.operation(input.operation_id);}catch{throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試，不要建立新操作');}
     if(persisted)throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試，不要建立新操作');
     if(error instanceof CatalogError)throw new OrderConflict(error.status,'ORDER_STOCK_REJECTED',error.message);
     throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試，不要建立新操作');
    }
    try{op=await this.operation(input.operation_id);}catch{throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試，不要建立新操作');}
    if(!op)throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試，不要建立新操作');
   }
   if(op.kind==='delete'){
    if(hasInventoryDelta(plan.delta))throw deleteStockReview();
    try{row=rowCells(await this.sheets.locateForDelete!(input.id));}
    catch{await this.setPhase(op.id,'pending');throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','無法唯一定位刪除訂單，操作保留待人工核對；不會改動庫存');}
    if(!blankRow(row)){
     if(row[16]!==input.id||await rowRevision(row)!==op.expected_hash)throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','刪除列已有差異，停止清除並保留操作待人工核對');
     await this.setPhase(op.id,'sheet_submitting');
     try{
      await this.sheets.clearOrder!(input.id);row=rowCells(await this.sheets.locateForDelete!(input.id));
      if(!blankRow(row))throw new Error('Delete verification mismatch');
     }catch{await this.setPhase(op.id,'pending');throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','訂單清除結果尚待確認；請保留操作並對帳，不會回補庫存');}
    }
    return this.finish(op,plan,row,actor,'');
   }
   if(!op)throw new OrderConflict(503,'ORDER_OPERATION_RESULT_UNKNOWN','訂單操作結果尚待確認；請保留本次操作識別並重試');
   if(!row.length)row=rowCells(await this.sheets.locate(input.id));
   plan=JSON.parse(op.after_fields);
   if(op.phase==='sheet_submitting'||op.phase==='pending'){
    if(await rowRevision(row)!==plan.after_hash)throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','上次操作結果尚待確認，不會重複寫入或回補庫存');
   }else if(Object.keys(plan.fields).length){
    if(await rowRevision(row)!==op.expected_hash)throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','訂單已有變更，請先對帳');
    await this.setPhase(op.id,'sheet_submitting');
    try{await this.sheets.write(input.id,plan.fields);row=rowCells(await this.sheets.locate(input.id));if(await rowRevision(row)!==plan.after_hash)throw new Error('Write confirmation mismatch');}
    catch{await this.setPhase(op.id,'pending');throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','寫入結果尚待確認，請保留操作並對帳，勿重複送出');}
   }
   return this.finish(op,plan,row,actor,'');
  });
 }
 private async finish(op:Operation,plan:Plan,row:string[],actor:string,reason:string):Promise<Record<string,unknown>>{
  if(op.kind==='delete'&&!blankRow(row))throw new OrderConflict(409,'ORDER_RECONCILIATION_REQUIRED','刪除列尚未完全清空，停止結案與庫存處理');
  const result={success:true,id:op.order_id,revision:await rowRevision(row),...(op.kind==='items'?{items:pricedItems(plan.next),total:total(plan.next)}:{}),warning:plan.warning,message:plan.warning||'訂單已更新'};
  const positive=Object.fromEntries(Object.entries(plan.delta).filter(([,n])=>n>0));
  try{await this.catalog.orderCommit(positive,actor,op.id,[
   this.db.prepare("INSERT INTO order_operation_effects(operation_id,effect,actor,reason,created_at) VALUES(?,'completed',?,?,?)").bind(op.id,actor,reason||plan.reason||'',now()),
   this.db.prepare("INSERT INTO order_inventory(order_id,proof,updated_at) VALUES(?,?,?) ON CONFLICT(order_id) DO UPDATE SET proof=excluded.proof,updated_at=excluded.updated_at").bind(op.order_id,JSON.stringify(plan.next),now()),
   this.db.prepare("UPDATE order_operations SET phase='completed',result=?,updated_at=? WHERE id=?").bind(JSON.stringify(result),now(),op.id)
  ]);}catch(error){const winner=await this.operation(op.id);if(winner?.phase==='completed')return {...JSON.parse(winner.result),reused:true};throw error;}
  return result;
 }
 async decorate(inputRow:string[]):Promise<{revision:string;priced_items:ReturnType<typeof pricedItems>|null;can_edit_items:boolean;historical:boolean;operation_pending:boolean;price_options?:Array<{product_id:string;name:string;price:number}>}>{
  const row=rowCells(inputRow);
  const id=row[16];if(!uuid.safeParse(id).success)return {revision:await rowRevision(row),priced_items:null,can_edit_items:false,historical:true,operation_pending:false};
  const pending=this.readPending?this.readPending.has(id):!!await this.db.prepare("SELECT id FROM order_operations WHERE order_id=? AND phase IN ('prepared','sheet_submitting','pending') LIMIT 1").bind(id).first();
  let p:InventoryProof;try{p=await this.proof(id,row);}catch{return {revision:await rowRevision(row),priced_items:null,can_edit_items:false,historical:false,operation_pending:true};}
  const hasPrices=Object.keys(p.prices).length>0;return {revision:await rowRevision(row),priced_items:hasPrices&&!pending?pricedItems(p):null,can_edit_items:hasPrices&&!pending&&!row[17]&&!p.has_shipped&&!['已出貨','取消訂單'].includes(row[14]),historical:p.historical,operation_pending:pending,price_options:hasPrices?Object.entries(p.prices).map(([id,p])=>({product_id:id,name:p.name,price:p.price})):[]};
 }
 async loadReadView(ids:string[]):Promise<void>{
  const unique=[...new Set(ids.filter(id=>uuid.safeParse(id).success))];this.readInventory=new Map();this.readReservations=new Map();this.readPending=new Set();
  for(let offset=0;offset<unique.length;offset+=80){const chunk=unique.slice(offset,offset+80),slots=chunk.map(()=>'?').join(',');const [a,b,c]=await this.db.batch([
   this.db.prepare(`SELECT order_id,proof FROM order_inventory WHERE order_id IN (${slots})`).bind(...chunk),
   this.db.prepare(`SELECT id,state,quantities,snapshot FROM stock_reservations WHERE id IN (${slots})`).bind(...chunk),
   this.db.prepare(`SELECT order_id FROM order_operations WHERE order_id IN (${slots}) AND phase IN ('prepared','sheet_submitting','pending')`).bind(...chunk)
  ]);if(!a||!b||!c)throw new OrderConflict(503,'ORDER_VIEW_UNAVAILABLE','訂單狀態暫時無法取得');for(const raw of a.results){const row=raw as {order_id:string;proof:string};this.readInventory.set(row.order_id,row.proof);}for(const raw of b.results){const row=raw as {id:string;state:string;quantities:string;snapshot:string};this.readReservations.set(row.id,row);}for(const raw of c.results){const row=raw as {order_id:string};this.readPending.add(row.order_id);}}
 }
 private async pendingSnapshot():Promise<Array<{id:string;order_id:string;actor:string;kind:string;phase:string;created_at:string;updated_at:string}>>{
  const limit=MAX_OPERATIONS_SNAPSHOT_ROWS+1,bytes=MAX_OPERATIONS_SNAPSHOT_BYTES;
  const candidates=`SELECT id,LENGTH(CAST(id AS BLOB))+LENGTH(CAST(order_id AS BLOB))+LENGTH(CAST(actor AS BLOB))+LENGTH(CAST(kind AS BLOB))+LENGTH(CAST(phase AS BLOB))+LENGTH(CAST(created_at AS BLOB))+LENGTH(CAST(updated_at AS BLOB)) AS raw_bytes FROM order_operations WHERE phase IN ('prepared','sheet_submitting','pending') ORDER BY created_at ASC,id ASC LIMIT ${limit}`;
  const [measure,rows]=await this.db.batch([
   this.db.prepare(`WITH candidates AS (${candidates}) SELECT id,raw_bytes FROM candidates`),
   this.db.prepare(`WITH candidates AS (${candidates}),bounds AS (SELECT COUNT(*) AS row_count,COALESCE(SUM(raw_bytes),0) AS raw_bytes FROM candidates) SELECT o.id,o.order_id,o.actor,o.kind,o.phase,o.created_at,o.updated_at FROM candidates c JOIN order_operations o ON o.id=c.id CROSS JOIN bounds b WHERE b.row_count<=${MAX_OPERATIONS_SNAPSHOT_ROWS} AND b.raw_bytes<=${bytes} ORDER BY o.created_at ASC,o.id ASC`)
  ]);
  if(!measure||!rows)throw new OrderConflict(503,'ORDER_VIEW_UNAVAILABLE','待辦清單暫時無法讀取');
  const measured=measure.results as Array<{raw_bytes:number|string}>,rawBytes=measured.reduce((sum,row)=>sum+Number(row.raw_bytes),0);
  if(measured.length>MAX_OPERATIONS_SNAPSHOT_ROWS)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','待辦清單超出安全讀取範圍，請重新載入');
  if(!Number.isSafeInteger(rawBytes))throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','待辦資料格式需核對，請重新載入');
  if(rawBytes>bytes)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','待辦清單超出安全讀取範圍，請重新載入');
  if(rows.results.length!==measured.length)throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','待辦資料格式需核對，請重新載入');
  return rows.results as Array<{id:string;order_id:string;actor:string;kind:string;phase:string;created_at:string;updated_at:string}>;
 }
 async pending(){
  const result=await this.db.prepare("SELECT id,order_id,actor,kind,phase,created_at,updated_at FROM order_operations WHERE phase IN ('prepared','sheet_submitting','pending') ORDER BY created_at ASC,id ASC LIMIT 101").all<{id:string;order_id:string;actor:string;kind:string;phase:string;created_at:string;updated_at:string}>();
  const results=result.results;
  if(results.length>100)throw new OrderConflict(409,'OPERATIONS_RELOAD_REQUIRED','待確認操作超過舊版清單上限，請使用分頁重新載入');
  if(new TextEncoder().encode(JSON.stringify(results)).byteLength>MAX_OPERATIONS_SNAPSHOT_BYTES)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','待辦清單超出安全讀取範圍，請重新載入');
  return result;
 }
 async pendingPage(actor:string,pageSize:number,cursor?:string):Promise<OperationsPage<{id:string;order_id:string;actor:string;kind:string;phase:string;created_at:string;updated_at:string}>>{
  const results=await this.pendingSnapshot();
  return paginateOperationsSnapshot('pending',actor,results,pageSize,cursor);
 }
 private async auditSnapshot():Promise<Array<{id:string;order_id:string;kind:string;actor:string;phase:string;created_at:string;before_fields:string;after_fields:string;resolved_by?:string;resolution_reason?:string}>>{
  const limit=MAX_OPERATIONS_SNAPSHOT_ROWS+1,bytes=MAX_OPERATIONS_SNAPSHOT_BYTES;
  const candidates=`SELECT o.id,LENGTH(CAST(o.id AS BLOB))+LENGTH(CAST(o.order_id AS BLOB))+LENGTH(CAST(o.kind AS BLOB))+LENGTH(CAST(o.actor AS BLOB))+LENGTH(CAST(o.phase AS BLOB))+LENGTH(CAST(o.created_at AS BLOB))+LENGTH(CAST(o.before_fields AS BLOB))+LENGTH(CAST(o.after_fields AS BLOB))+COALESCE(LENGTH(CAST(e.actor AS BLOB)),0)+COALESCE(LENGTH(CAST(e.reason AS BLOB)),0) AS raw_bytes FROM order_operations o LEFT JOIN order_operation_effects e ON e.operation_id=o.id AND e.effect=o.phase ORDER BY o.created_at DESC,o.id DESC LIMIT ${limit}`;
  const [measure,rows]=await this.db.batch([
   this.db.prepare(`WITH candidates AS (${candidates}) SELECT id,raw_bytes FROM candidates`),
   this.db.prepare(`WITH candidates AS (${candidates}),bounds AS (SELECT COUNT(*) AS row_count,COALESCE(SUM(raw_bytes),0) AS raw_bytes FROM candidates) SELECT o.id,o.order_id,o.kind,o.actor,o.phase,o.created_at,o.before_fields,o.after_fields,e.actor AS resolved_by,e.reason AS resolution_reason FROM candidates c JOIN order_operations o ON o.id=c.id LEFT JOIN order_operation_effects e ON e.operation_id=o.id AND e.effect=o.phase CROSS JOIN bounds b WHERE b.row_count<=${MAX_OPERATIONS_SNAPSHOT_ROWS} AND b.raw_bytes<=${bytes} ORDER BY o.created_at DESC,o.id DESC`)
  ]);
  if(!measure||!rows)throw new OrderConflict(503,'ORDER_VIEW_UNAVAILABLE','操作紀錄暫時無法讀取');
  const measured=measure.results as Array<{raw_bytes:number|string}>,rawBytes=measured.reduce((sum,row)=>sum+Number(row.raw_bytes),0);
  if(measured.length>MAX_OPERATIONS_SNAPSHOT_ROWS)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','操作紀錄超出安全讀取範圍，請重新載入');
  if(!Number.isSafeInteger(rawBytes))throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','操作紀錄格式需核對，請重新載入');
  if(rawBytes>bytes)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','操作紀錄超出安全讀取範圍，請重新載入');
  if(rows.results.length!==measured.length)throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','操作紀錄格式需核對，請重新載入');
  return rows.results as Array<{id:string;order_id:string;kind:string;actor:string;phase:string;created_at:string;before_fields:string;after_fields:string;resolved_by?:string;resolution_reason?:string}>;
 }
 async audit(){
  const bytes=MAX_OPERATIONS_SNAPSHOT_BYTES;
  const candidates=`SELECT o.id,LENGTH(CAST(o.id AS BLOB))+LENGTH(CAST(o.order_id AS BLOB))+LENGTH(CAST(o.kind AS BLOB))+LENGTH(CAST(o.actor AS BLOB))+LENGTH(CAST(o.phase AS BLOB))+LENGTH(CAST(o.created_at AS BLOB))+LENGTH(CAST(o.before_fields AS BLOB))+LENGTH(CAST(o.after_fields AS BLOB))+COALESCE(LENGTH(CAST(e.actor AS BLOB)),0)+COALESCE(LENGTH(CAST(e.reason AS BLOB)),0) AS raw_bytes FROM order_operations o LEFT JOIN order_operation_effects e ON e.operation_id=o.id AND e.effect=o.phase ORDER BY o.created_at DESC,o.id DESC LIMIT 101`;
  const [measure,rows]=await this.db.batch([
   this.db.prepare(`WITH candidates AS (${candidates}) SELECT id,raw_bytes FROM candidates`),
   this.db.prepare(`WITH candidates AS (${candidates}),bounds AS (SELECT COUNT(*) AS row_count,COALESCE(SUM(raw_bytes),0) AS raw_bytes FROM candidates) SELECT o.id,o.order_id,o.kind,o.actor,o.phase,o.created_at,o.before_fields,o.after_fields,e.actor AS resolved_by,e.reason AS resolution_reason FROM candidates c JOIN order_operations o ON o.id=c.id LEFT JOIN order_operation_effects e ON e.operation_id=o.id AND e.effect=o.phase CROSS JOIN bounds b WHERE b.row_count<=100 AND b.raw_bytes<=${bytes} ORDER BY o.created_at DESC,o.id DESC`)
  ]);
  if(!measure||!rows)throw new OrderConflict(503,'ORDER_VIEW_UNAVAILABLE','操作紀錄暫時無法讀取');
  const measured=measure.results as Array<{raw_bytes:number|string}>;
  if(measured.length>100)throw new OrderConflict(409,'OPERATIONS_RELOAD_REQUIRED','操作紀錄超過舊版清單上限，請使用分頁重新載入');
  const rawBytes=measured.reduce((sum,row)=>sum+Number(row.raw_bytes),0);
  if(!Number.isSafeInteger(rawBytes))throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','操作紀錄格式需核對，請重新載入');
  if(rawBytes>bytes)throw new OrderConflict(413,'OPERATIONS_SNAPSHOT_TOO_LARGE','操作紀錄超出安全讀取範圍，請重新載入');
  if(rows.results.length!==measured.length)throw new OrderConflict(409,'OPERATIONS_SNAPSHOT_CORRUPT','操作紀錄格式需核對，請重新載入');
  const results=rows.results as Array<{id:string;order_id:string;kind:string;actor:string;phase:string;created_at:string;before_fields:string;after_fields:string;resolved_by?:string;resolution_reason?:string}>;
  return {results};
 }
 async auditPage(actor:string,pageSize:number,cursor?:string):Promise<OperationsPage<{id:string;order_id:string;kind:string;actor:string;phase:string;created_at:string;before_fields:string;after_fields:string;resolved_by?:string;resolution_reason?:string}>>{
  const results=await this.auditSnapshot();
  return paginateOperationsSnapshot('audit',actor,results,pageSize,cursor);
 }
 async reconcile(operationId:string,actor:string,action:'confirm'|'abandon',reason:string):Promise<Record<string,unknown>>{
  uuid.parse(operationId);if(typeof reason!=='string'||reason.trim().length<3||reason.length>300)throw new OrderConflict(400,'REASON_REQUIRED','請填寫核對原因');
  return this.lease(async()=>{
   const op=await this.operation(operationId);if(!op)throw new OrderConflict(404,'OPERATION_NOT_FOUND','找不到待辦操作');if(['completed','rejected'].includes(op.phase))return {success:true,reused:true,message:'操作已結案'};
   const plan=JSON.parse(op.after_fields) as Plan,isDelete=op.kind==='delete';
   if(isDelete&&action==='confirm'&&hasInventoryDelta(plan.delta))throw deleteStockReview();
   if(isDelete&&(!this.sheets.locateForDelete||!this.sheets.clearOrder))throw new OrderConflict(503,'ORDER_DELETE_UNAVAILABLE','訂單清除功能尚未配置，沒有變更資料或庫存。');
   const row=rowCells(isDelete?await this.sheets.locateForDelete!(op.order_id):await this.sheets.locate(op.order_id)),hash=await rowRevision(row);
   if(action==='confirm'){
    if(isDelete&&!blankRow(row))throw new OrderConflict(409,'RECONCILIATION_UNCERTAIN','刪除列尚未確認 A:R 全空，停止結案與庫存處理');
    if(hash!==plan.after_hash)throw new OrderConflict(409,'RECONCILIATION_UNCERTAIN','資料尚不符合預期結果，停止補寫與回補；請人工核對');
    return this.finish(op,plan,row,actor,reason);
   }
   if(hash!==op.expected_hash||plan.after_hash===op.expected_hash)throw new OrderConflict(409,'RECONCILIATION_UNCERTAIN','無法確認未寫入，不能撤回此操作');
   if(op.phase!=='prepared'&&Date.now()-Date.parse(op.created_at)<600000)throw new OrderConflict(409,'RECONCILIATION_WAIT','結果不明的操作至少等待十分鐘後再核對，避免晚到的寫入');
   const second=rowCells(isDelete?await this.sheets.locateForDelete!(op.order_id):await this.sheets.locate(op.order_id));if(await rowRevision(second)!==op.expected_hash)throw new OrderConflict(409,'RECONCILIATION_UNCERTAIN','核對期間資料已變更，停止撤回');
   const restore=Object.fromEntries(Object.entries(plan.delta).filter(([,n])=>n<0).map(([id,n])=>[id,-n]));
   const message=isDelete?'已核對訂單尚未清空並撤回操作；刪除不會自動回補庫存。':'已撤回未完成的操作與追加預留';
   await this.catalog.orderCommit(restore,actor,op.id,[this.db.prepare("INSERT INTO order_operation_effects(operation_id,effect,actor,reason,created_at) VALUES(?,'rejected',?,?,?)").bind(op.id,actor,reason.trim(),now()),this.db.prepare("UPDATE order_operations SET phase='rejected',result=?,updated_at=? WHERE id=?").bind(JSON.stringify({message}),now(),op.id)]);
   return {success:true,message};
  });
 }

}
