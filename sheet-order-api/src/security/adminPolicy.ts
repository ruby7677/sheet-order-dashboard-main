import type {MiddlewareHandler}from 'hono';
interface PolicyEnv {CATALOG_DB:D1Database;ADMIN_WRITE_EMAILS?:string;ADMIN_DELETE_EMAILS?:string;ADMIN_PRICING_EMAILS?:string;}
const includes=(value:string|undefined,email:string)=>(value||'').split(',').map(x=>x.trim().toLowerCase()).includes(email);
export const adminPolicy:MiddlewareHandler<{Bindings:PolicyEnv}>=async(c,next)=>{
 const identity=c.get('admin'),write=!['GET','HEAD','OPTIONS'].includes(c.req.method),path=c.req.path;
 const remove=path==='/api/orders'||path.endsWith('/delete_order.php')||path.endsWith('/batch_delete_orders.php')||path==='/api/orders/batch';
 const price=path==='/api/orders/pricing';
 if(write&&!includes(remove?c.env.ADMIN_DELETE_EMAILS:price?c.env.ADMIN_PRICING_EMAILS:c.env.ADMIN_WRITE_EMAILS,identity.email))return c.json({success:false,code:'OPERATION_FORBIDDEN',message:'此帳號沒有這項修改權限'},403);
 const bucket=write?(remove?'delete':'write'):'read',limit=write?(remove?10:30):120,window=Math.floor(Date.now()/60000)*60;
 try{const row=await c.env.CATALOG_DB.prepare('INSERT INTO admin_request_limits(identity,bucket,window_start,count) VALUES(?,?,?,1) ON CONFLICT(identity,bucket,window_start) DO UPDATE SET count=count+1 RETURNING count').bind(identity.email,bucket,window).first<{count:number}>();if(!row||row.count>limit)return c.json({success:false,code:'ADMIN_RATE_LIMITED',message:'操作次數過多，請稍後再試'},429);}
 catch{return c.json({success:false,code:'ADMIN_LIMIT_UNAVAILABLE',message:'管理限速服務暫時無法使用'},503);}
 await next();
};
