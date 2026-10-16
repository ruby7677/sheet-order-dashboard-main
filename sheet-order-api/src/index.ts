import {catalogVersionDiagnostic,checkoutGateway,checkoutMutationSchema,CheckoutGatewayError}from './services/CheckoutGateway';
import type {CheckoutServiceBinding} from './services/CheckoutGateway';
import {z}from 'zod';
import {manualOrderInputSchema,manualGatewayResultSchema} from './services/ManualOrderContract';
import {CacheService} from './services/CacheService';
import {adminPolicy} from './security/adminPolicy';
import {readOrders,mutateOrder,deleteBatch,pendingOrders,auditOrders,reconcileOrder} from './endpoints/orderManagement';
import { CatalogService, CatalogError, visibleProducts } from './services/CatalogService';
import { OrderConflict } from './services/OrderContract';
import { parseOperationsPageQuery, safeOperationsPaginationError } from './services/OperationsPagination';
import type { OperationsPageEnvelope } from './services/OperationsPagination';
import { bodyLimit } from 'hono/body-limit';
import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { allowedOrigins, requireAdmin } from './security/access';
import { GetCustomersFromSheet } from './endpoints/getCustomersFromSheet';
import { GetCustomerOrders } from './endpoints/getCustomerOrders';
import { GetAdminDashboard } from './endpoints/getAdminDashboard';
const app = new Hono<{ Bindings: Env }>();
const checkoutGatewayFailure=(route:'pending'|'reconcile'|'catalog-health',error:unknown):CheckoutGatewayError=>{
 const failure=error instanceof CheckoutGatewayError?error:new CheckoutGatewayError(503,'CATALOG_GATEWAY_UNEXPECTED_FAILURE');
 console.error(JSON.stringify({event:'checkout_gateway_failure',route,code:failure.code,status:failure.status}));
 return failure;
};
app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  const origin = c.req.header('Origin');
  if (origin && !allowedOrigins(c.env).includes(origin)) return c.json({ success: false, code: 'ORIGIN_NOT_ALLOWED' }, 403);
  await next();
});
app.use('*', cors({ origin: (origin, c) => allowedOrigins(c.env).includes(origin) ? origin : null, allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'X-Requested-With', 'Cache-Control', 'Pragma', 'Expires'], credentials: true }));
app.get('/health', c => c.json({ success: true }));
app.use('*', requireAdmin);
app.use('/api/*',adminPolicy);
app.get('/api/auth/me', c => { const user=c.get('admin'); return c.json({ success:true, logged_in:true, user:{ id:user.id, username:user.email, email:user.email, full_name:user.email, role:user.role } }); });
app.use('/api/settings/*', bodyLimit({maxSize:32768,onError:c=>c.json({success:false,message:'請求過大'},413)}));
app.get('/api/settings/products', async c => {try {const s=await new CatalogService(c.env.CATALOG_DB).snapshot();return c.json({success:true,data:visibleProducts(s.products,true),revision:s.revision,read_only:s.read_only});}catch{return c.json({success:false,message:'目前商品設定無法讀取'},503);}});
app.get('/api/settings/delivery', async c => {try {const s=await new CatalogService(c.env.CATALOG_DB).snapshot();return c.json({success:true,data:s.delivery,revision:s.revision,read_only:s.read_only});}catch{return c.json({success:false,message:'目前到貨日期設定無法讀取'},503);}});
const settingsFailure=(error:unknown)=>({success:false,message:error instanceof CatalogError?error.message:'設定儲存失敗，請重新載入確認'});
app.post('/api/settings/products',async c=>{try{const v=await c.req.json<{product:{id:string};expected_revision:number}>();const s=await new CatalogService(c.env.CATALOG_DB!).saveProduct(v.product?.id,v.product,v.expected_revision,c.get('admin').email,true);return c.json({success:true,revision:s.revision});}catch(e){return c.json(settingsFailure(e),e instanceof CatalogError?e.status:503);}});
app.put('/api/settings/products/:id',async c=>{try{const v=await c.req.json<{product:unknown;expected_revision:number}>();const s=await new CatalogService(c.env.CATALOG_DB!).saveProduct(c.req.param('id'),v.product,v.expected_revision,c.get('admin').email);return c.json({success:true,revision:s.revision});}catch(e){return c.json(settingsFailure(e),e instanceof CatalogError?e.status:503);}});
app.delete('/api/settings/products/:id',async c=>{try{const v=await c.req.json<{expected_revision:number}>();const s=await new CatalogService(c.env.CATALOG_DB!).saveProduct(c.req.param('id'),{is_active:false},v.expected_revision,c.get('admin').email);return c.json({success:true,revision:s.revision});}catch(e){return c.json(settingsFailure(e),e instanceof CatalogError?e.status:503);}});
app.put('/api/settings/delivery',async c=>{try{const v=await c.req.json<{settings:unknown;expected_revision:number}>();const s=await new CatalogService(c.env.CATALOG_DB!).saveDelivery(v.settings,v.expected_revision,c.get('admin').email);return c.json({success:true,revision:s.revision});}catch(e){return c.json(settingsFailure(e),e instanceof CatalogError?e.status:503);}});
app.on(['POST','PUT','DELETE'],'/api/settings/*',c=>c.json({success:false,code:'SETTINGS_STORAGE_PENDING',message:'不支援的設定操作'},503));
app.post('/api/admin/login', c => c.json({ success:false, code:'USE_CLOUDFLARE_ACCESS' }, 410));
app.post('/api/admin_login.php', c => c.json({ success:false, code:'USE_CLOUDFLARE_ACCESS' }, 410));
app.use('/api/*',bodyLimit({maxSize:65536,onError:c=>c.json({success:false,message:'請求過大'},413)}));
app.get('/api/orders',readOrders);app.get('/api/get_orders_from_sheet.php',readOrders);
app.get('/api/manual-orders/options',async c=>{try{const s=await new CatalogService(c.env.CATALOG_DB).snapshot();return c.json({success:true,data:{products:visibleProducts(s.products),delivery:s.delivery},revision:s.revision,read_only:s.read_only||(c.env as Env&{MANUAL_ORDER_READY?:string}).MANUAL_ORDER_READY!=='1'});}catch{return c.json({success:false,message:'手抄單設定目前無法讀取'},503);}});
app.post('/api/manual-orders',async c=>{
 if(c.env.ORDER_WRITE_READY!=='1'||(c.env as Env&{MANUAL_ORDER_READY?:string}).MANUAL_ORDER_READY!=='1')return c.json({success:false,message:'手抄單尚未啟用',safe_to_restart:false},503);
 const parsed=manualOrderInputSchema.safeParse(await c.req.json().catch(()=>null));
 if(!parsed.success)return c.json({success:false,message:'請確認手抄單欄位與商品數量',safe_to_restart:false},400);
 try{const result=manualGatewayResultSchema.parse(await checkoutGateway((c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API,c.req.header('Cf-Access-Jwt-Assertion')||'',{action:'create_manual',...parsed.data},c.get('admin').email));if(result.result.success&&c.env.CACHE_KV)await c.env.CACHE_KV.delete(CacheService.generateKey('admin_dashboard_v2')).catch(()=>console.error('manual_dashboard_cache_clear_failed'));return c.json(result.result,result.status);}
 catch(error){const failure=checkoutGatewayFailure('reconcile',error);return c.json({success:false,message:'入單結果尚待確認，請保留此頁並核對原單',safe_to_restart:false,code:failure.code},failure.status);}
});
app.get('/api/manual-orders/stores',async c=>{const query=c.req.query('query')||'';if(!query.trim()||query.length>100)return c.json({success:false,message:'請輸入門市名稱、地址或店號'},400);try{const data=await checkoutGateway((c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API,c.req.header('Cf-Access-Jwt-Assertion')||'',{action:'store_search',query});if(!Array.isArray(data))throw new Error('INVALID_STORES');return c.json({success:true,data});}catch{return c.json({success:false,message:'門市搜尋暫時無法完成，請稍後再試'},503);}});
app.get('/api/manual-orders/status',async c=>{const id=z.string().uuid().safeParse(c.req.query('id'));if(!id.success)return c.json({success:false,message:'訂單識別不正確'},400);try{const data=await checkoutGateway((c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API,c.req.header('Cf-Access-Jwt-Assertion')||'',{action:'manual_status',order_id:id.data});return c.json({success:true,data});}catch{return c.json({success:false,message:'原單資料尚無法恢復，請保留原頁或到待辦核對'},409);}});
app.put('/api/orders/status',mutateOrder('status'));app.post('/api/update_order_status.php',mutateOrder('status'));
app.put('/api/orders/payment',mutateOrder('payment'));app.post('/api/update_payment_status.php',mutateOrder('payment'));
app.put('/api/orders/items',mutateOrder('items'));app.post('/api/update_order_items.php',mutateOrder('items'));
app.delete('/api/orders',mutateOrder('delete'));app.post('/api/delete_order.php',mutateOrder('delete'));
app.delete('/api/orders/batch',deleteBatch);app.post('/api/batch_delete_orders.php',deleteBatch);
app.post('/api/orders/pricing',mutateOrder('pricing'));
app.get('/api/orders/pending',pendingOrders);app.post('/api/orders/reconcile',reconcileOrder);
app.get('/api/checkouts/pending',async c=>{
 let query;
 try{query=parseOperationsPageQuery(new URL(c.req.url).searchParams);}
 catch(error){const safe=error instanceof OrderConflict?safeOperationsPaginationError(error.code,error.status):null;return c.json({success:false,code:safe?.code||'OPERATIONS_PAGE_REQUEST_INVALID',message:safe?.message||'待辦分頁參數不正確'},safe?.status||400);}
 try{
  const binding=(c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API,jwt=c.req.header('Cf-Access-Jwt-Assertion')||'';
  const request=query.paginated?{action:'list_page' as const,page_size:query.pageSize,...(query.cursor?{cursor:query.cursor}:{})}:{action:'list' as const};
  const result=await checkoutGateway(binding,jwt,request,c.get('admin').email);c.header('Cache-Control','no-store');
  if(query.paginated){const page=result as OperationsPageEnvelope<unknown>;return c.json({success:true,data:page.items,pagination:page.pagination});}
  if(!Array.isArray(result))throw new CheckoutGatewayError(503,'CATALOG_RESPONSE_INVALID');
  if(result.length>100)throw new CheckoutGatewayError(409,'OPERATIONS_RELOAD_REQUIRED');
  return c.json({success:true,data:result});
 }catch(error){const failure=checkoutGatewayFailure('pending',error);return c.json({success:false,message:'下單／通知待辦清單暫時無法讀取',code:failure.code},failure.status);}
});
app.post('/api/checkouts/reconcile',async c=>{try{const v=checkoutMutationSchema.parse(await c.req.json());const binding=(c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API;const jwt=c.req.header('Cf-Access-Jwt-Assertion')||'';return c.json({success:true,data:await checkoutGateway(binding,jwt,v)});}catch(error){if(error instanceof z.ZodError)return c.json({success:false,message:'核對操作格式不正確'},400);const failure=checkoutGatewayFailure('reconcile',error);return c.json({success:false,message:'核對結果尚待確認，未自動補寫或重寄',code:failure.code},failure.status);}});
app.get('/api/checkouts/catalog-health',async c=>{try{const binding=(c.env as Env&{CATALOG_API?:CheckoutServiceBinding}).CATALOG_API;return c.json({success:true,data:await catalogVersionDiagnostic(binding)});}catch(error){const failure=checkoutGatewayFailure('catalog-health',error);return c.json({success:false,message:'商品服務目前無法讀取',code:failure.code},failure.status);}});
app.get('/api/orders/audit',auditOrders);
const openapi = fromHono(app, { docs_url: null, redoc_url: null, openapi_url: null });
openapi.get('/api/customers', GetCustomersFromSheet);
openapi.get('/api/customers/orders', GetCustomerOrders);
openapi.get('/api/admin/dashboard', GetAdminDashboard);
openapi.get('/api/get_customers_from_sheet.php', GetCustomersFromSheet);
openapi.get('/api/get_customer_orders.php', GetCustomerOrders);
export default app;
