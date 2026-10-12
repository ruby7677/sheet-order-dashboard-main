import {z}from 'zod';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {CatalogService,CatalogError,visibleProducts} from './services/CatalogService';
import {OrderConflict} from './services/OrderContract';
import {safeOperationsPaginationError} from './services/OperationsPagination';
import {verifyServiceRequest} from './security/serviceAuth';
import {AccessError,allowedOrigins,verifyAccessToken} from './security/access';
import type {AdminIdentity} from './security/access';
import {checkoutReconciliation} from './services/CheckoutReconciliation';
import {checkoutRequestSchema} from './services/CheckoutGateway';
const app=new Hono<{Bindings:Env}>();
app.use('*',bodyLimit({maxSize:32768,onError:c=>c.json({success:false,message:'請求過大'},413)}));
app.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('X-Content-Type-Options','nosniff');await next();});
app.onError((e,c)=>c.json({success:false,message:e instanceof CatalogError?e.message:'設定服務暫時無法使用'},e instanceof CatalogError?e.status:503));
app.get('/public/catalog',async c=>{const s=await new CatalogService(c.env.CATALOG_DB!).snapshot();const delivery=structuredClone(s.delivery);delete delivery.delivery_period.updated_by;return c.json({success:true,data:{products:visibleProducts(s.products),delivery},revision:s.revision});});
app.get('/public/version',async c=>{const s=await new CatalogService(c.env.CATALOG_DB!).snapshot();return c.json({success:true,revision:s.revision});});
app.post('/internal/checkout-reconciliation',async c=>{
 const origin=c.req.header('Origin');
 if(origin&&!allowedOrigins(c.env).includes(origin))return c.json({success:false,message:'來源不允許'},403);
 const admins=['ruby7677@gmail.com','wade7616@gmail.com'];
 const configured=(c.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).sort();
 if(c.env.ACCESS_TEAM_DOMAIN!=='767780.cloudflareaccess.com'||c.env.ACCESS_AUDIENCE!=='acba9bfaa5b6ea9abaac4bfd10b052aba1c0cec6a99166d995f5f95353099438'||JSON.stringify(configured)!==JSON.stringify([...admins].sort()))return c.json({success:false,message:'管理驗證尚未配置'},503);
 let identity:AdminIdentity;
 try{identity=await verifyAccessToken(c.req.header('Cf-Access-Jwt-Assertion')||'',c.env);}
 catch(error){const status=error instanceof AccessError?error.status:503;return c.json({success:false,message:'管理身分驗證失敗'},status);}
 if(((c.req.header('Content-Type')||'').split(';',1)[0]||'').trim().toLowerCase()!=='application/json')return c.json({success:false,message:'請使用 JSON 格式'},415);
 const raw=await c.req.text();if(new TextEncoder().encode(raw).byteLength>32768)return c.json({success:false,message:'請求過大'},413);
 let input:unknown;try{input=JSON.parse(raw);}catch{return c.json({success:false,message:'請求格式錯誤'},400);}
 const parsed=checkoutRequestSchema.safeParse(input);if(!parsed.success){
  if(input&&typeof input==='object'&&(input as {action?:unknown}).action==='list_page'){
   const code=parsed.error.issues.some(issue=>issue.path[0]==='cursor')?'OPERATIONS_PAGE_CURSOR_INVALID':'OPERATIONS_PAGE_REQUEST_INVALID';
   const safe=safeOperationsPaginationError(code,400)!;return c.json({success:false,code:safe.code,message:safe.message},400);
  }
  return c.json({success:false,message:'對帳操作格式錯誤'},400);
 }
 try{const data=await checkoutReconciliation(c.env.SERVICE_HMAC_SECRET,identity.email,parsed.data);return c.json({success:true,data});}
 catch(error){const safe=error instanceof OrderConflict?safeOperationsPaginationError(error.code,error.status):null;if(safe)return c.json({success:false,code:safe.code,message:safe.message},safe.status);return c.json({success:false,message:'下單核對尚未完成，沒有自動補寫或重寄'},503);}
});
app.use('/service/*',async(c,next)=>{try{await verifyServiceRequest(c.req.raw,c.env.SERVICE_HMAC_SECRET,await c.req.text());}catch(e){if(e instanceof CatalogError)throw e;return c.json({success:false,message:'服務驗證失敗'},401);}await next();});
app.get('/service/snapshot',async c=>c.json({success:true,data:await new CatalogService(c.env.CATALOG_DB!).snapshot()}));
app.post('/service/reservations/status',async c=>{const v=z.object({ids:z.array(z.string().uuid()).max(100)}).strict().parse(await c.req.json());const service=new CatalogService(c.env.CATALOG_DB!);const data=[];for(const id of v.ids){const r=await service.reservation(id);data.push({id,state:r?.state||'missing'});}return c.json({success:true,data});});
app.post('/service/reserve',async c=>c.json({success:true,data:await new CatalogService(c.env.CATALOG_DB!).reserve(await c.req.json())}));
app.post('/service/transition',async c=>{const v=await c.req.json<{id:string;fingerprint:string;state:string}>();if(!['submitting','confirmed'].includes(v.state))throw new CatalogError(400,'狀態格式錯誤');await new CatalogService(c.env.CATALOG_DB!).transition(v.id,v.fingerprint,v.state as 'submitting'|'confirmed');return c.json({success:true});});
app.post('/service/release',async c=>{const v=await c.req.json<{id:string;fingerprint:string}>();await new CatalogService(c.env.CATALOG_DB!).release(v.id,v.fingerprint);return c.json({success:true});});
app.notFound(c=>c.json({success:false},404));
export default app;
