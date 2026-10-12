import type {Context} from 'hono';
import {z} from 'zod';
import {OrderSheets} from '../services/OrderSheets';
import {OrderWriteService} from '../services/OrderWriteService';
import {OrderColumn,OrderConflict,rowCells,uuid} from '../services/OrderContract';
import {DEFAULT_ORDER_PAGE_SIZE,MAX_ORDER_PAGE_SIZE,paginateOrders} from '../services/OrderPagination';
import {parseOperationsPageQuery} from '../services/OperationsPagination';
import {getOrderSheetName} from '../services/SheetNames';
import type {SheetNameEnv} from '../services/SheetNames';
interface Bindings extends SheetNameEnv {CATALOG_DB:D1Database;GOOGLE_SERVICE_ACCOUNT_KEY?:string;GOOGLE_SHEET_ID?:string;ORDER_WRITE_READY?:string;}
type C=Context<{Bindings:Bindings}>;
function service(c:C){if(!c.env.GOOGLE_SERVICE_ACCOUNT_KEY||!c.env.GOOGLE_SHEET_ID)throw new OrderConflict(503,'ORDER_CONFIG_MISSING','訂單資料服務尚未配置');return new OrderWriteService(c.env.CATALOG_DB,new OrderSheets(c.env.GOOGLE_SERVICE_ACCOUNT_KEY,c.env.GOOGLE_SHEET_ID,getOrderSheetName(c.env)));}
function fail(c:C,e:unknown){return c.json({success:false,code:e instanceof OrderConflict?e.code:'ORDER_SERVICE_UNAVAILABLE',message:e instanceof OrderConflict?e.message:'訂單服務暫時無法完成，請重新載入確認'},e instanceof OrderConflict?e.status as 400|403|404|409|413|503:503);}
export async function readOrders(c:C){
 try{
  if(!c.env.GOOGLE_SERVICE_ACCOUNT_KEY||!c.env.GOOGLE_SHEET_ID)throw new OrderConflict(503,'ORDER_CONFIG_MISSING','訂單資料服務尚未配置');
  const requestedPageSize=c.req.query('page_size');
  const requestedCursor=c.req.query('cursor');
  const legacyUnpagedAlias=c.req.path==='/api/get_orders_from_sheet.php'&&requestedPageSize===undefined&&requestedCursor===undefined;
  const pageSize=requestedPageSize===undefined?DEFAULT_ORDER_PAGE_SIZE:/^\d{1,3}$/.test(requestedPageSize)?Number(requestedPageSize):NaN;
  if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>MAX_ORDER_PAGE_SIZE)throw new OrderConflict(400,'INVALID_PAGE_SIZE','每頁筆數須為1至500');
  const store=new OrderSheets(c.env.GOOGLE_SERVICE_ACCOUNT_KEY,c.env.GOOGLE_SHEET_ID,getOrderSheetName(c.env)),manager=service(c),sourceRows=await store.rows();
  const indexedRows=sourceRows.slice(1).map((row,sheetIndex)=>({row:rowCells(row),sheetIndex:sheetIndex+1}));
  const ids=indexedRows.map(({row})=>row[OrderColumn.uuid]).filter(id=>uuid.safeParse(id).success).map(id=>id.toLowerCase());if(new Set(ids).size!==ids.length)throw new OrderConflict(409,'DUPLICATE_ORDER_UUID','訂單識別重複，停止修改並請先對帳');
  const visibleRows=indexedRows.filter(({row})=>row[OrderColumn.customerName].trim()&&!row[OrderColumn.archivedAt]);
  let pageRows=visibleRows;
  let pagination:Awaited<ReturnType<typeof paginateOrders>>['pagination']|undefined;
  if(legacyUnpagedAlias){
   if(visibleRows.length>MAX_ORDER_PAGE_SIZE)throw new OrderConflict(503,'LEGACY_CLIENT_RELOAD_REQUIRED','訂單筆數超過舊版頁面安全上限，請重新整理新版後台使用分頁');
  }else{
   const page=await paginateOrders(sourceRows,visibleRows,pageSize,requestedCursor);pageRows=page.rows;pagination=page.pagination;
  }
  const pageIds=pageRows.map(({row})=>row[OrderColumn.uuid]).filter(id=>uuid.safeParse(id).success);await manager.loadReadView(pageIds);
  const data=[];for(const {row:r,sheetIndex} of pageRows){const fallbackIndex=sheetIndex-1,id=r[OrderColumn.uuid],extra=await manager.decorate(r);data.push({id:id||`legacy-${fallbackIndex}`,orderNumber:`ORD-${r[OrderColumn.legacyRow]||id.slice(0,8)||fallbackIndex}`,createdAt:r[OrderColumn.timestamp],customerName:r[OrderColumn.customerName],customerPhone:r[OrderColumn.phone],deliveryMethod:r[OrderColumn.deliveryMethod],deliveryAddress:r[OrderColumn.address],dueDate:r[OrderColumn.preferredDate],deliveryTime:r[OrderColumn.preferredTime],note:r[OrderColumn.notes],items:r[OrderColumn.items],amount:r[OrderColumn.totalAmount],paymentMethod:r[OrderColumn.paymentMethod],status:r[OrderColumn.status],paymentStatus:r[OrderColumn.paymentStatus],...extra,can_manage:uuid.safeParse(id).success&&c.env.ORDER_WRITE_READY==='1'});}
  c.header('Cache-Control','no-store');const response:{success:true;data:typeof data;pagination?:typeof pagination;message:string}={success:true,data,message:'訂單資料已更新'};if(pagination)response.pagination=pagination;return c.json(response);
 }catch(e){return fail(c,e);}
}
export function mutateOrder(kind:'status'|'payment'|'items'|'delete'|'pricing'){
 return async(c:C)=>{try{if(c.env.ORDER_WRITE_READY!=='1')throw new OrderConflict(503,'ORDER_MIGRATION_PENDING','訂單識別遷移尚待驗證，暫停管理修改');const raw=await c.req.json<Record<string,unknown>>();const result=await service(c).mutate({...raw,kind},c.get('admin').email);return c.json(result);}catch(e){return fail(c,e);}};
}
export async function deleteBatch(c:C){try{
 if(c.env.ORDER_WRITE_READY!=='1')throw new OrderConflict(503,'ORDER_MIGRATION_PENDING','訂單識別遷移尚待驗證');
 const parsed=z.object({orders:z.array(z.object({id:uuid,expected_revision:z.string().regex(/^[a-f0-9]{64}$/),operation_id:uuid}).strict()).min(1).max(10)}).strict().safeParse(await c.req.json());if(!parsed.success)throw new OrderConflict(400,'INVALID_BATCH','批次操作須包含版本與唯一識別，每批最多十筆');if(new Set(parsed.data.orders.map(x=>x.id)).size!==parsed.data.orders.length)throw new OrderConflict(400,'DUPLICATE_ORDER','批次訂單不得重複');
 const manager=service(c),results=[];for(const order of parsed.data.orders){try{const result=await manager.mutate({...order,kind:'delete'},c.get('admin').email);results.push({id:order.id,success:true,message:String(result.message),warning:result.warning});}catch(e){results.push({id:order.id,success:false,message:e instanceof OrderConflict?e.message:'操作尚待確認',code:e instanceof OrderConflict?e.code:'ORDER_SERVICE_UNAVAILABLE'});}}
 const totalDeleted=results.filter(r=>r.success).length;return c.json({success:true,results,totalDeleted,totalFailed:results.length-totalDeleted,message:'批次結果已逐筆記錄'});
 }catch(e){return fail(c,e);}}
export async function pendingOrders(c:C){try{
 const query=parseOperationsPageQuery(new URL(c.req.url).searchParams),manager=service(c);c.header('Cache-Control','no-store');
 if(!query.paginated)return c.json({success:true,data:(await manager.pending()).results});
 const page=await manager.pendingPage(c.get('admin').email,query.pageSize,query.cursor);return c.json({success:true,data:page.rows,pagination:page.pagination});
}catch(e){return fail(c,e);}}
const readOnlyOrderStore={locate:async()=>[],write:async()=>{},rows:async()=>[]};
export async function auditOrders(c:C){try{
 const query=parseOperationsPageQuery(new URL(c.req.url).searchParams),manager=new OrderWriteService(c.env.CATALOG_DB,readOnlyOrderStore);c.header('Cache-Control','no-store');
 if(!query.paginated)return c.json({success:true,data:(await manager.audit()).results});
 const page=await manager.auditPage(c.get('admin').email,query.pageSize,query.cursor);return c.json({success:true,data:page.rows,pagination:page.pagination});
}catch(e){return fail(c,e);}}
export async function reconcileOrder(c:C){try{const v=z.object({operation_id:uuid,action:z.enum(['confirm','abandon']),reason:z.string().trim().min(3).max(300)}).strict().parse(await c.req.json());return c.json(await service(c).reconcile(v.operation_id,c.get('admin').email,v.action,v.reason));}catch(e){return fail(c,e);}}
