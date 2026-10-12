import { CatalogError } from '../services/CatalogService';
const encoder=new TextEncoder();
export async function verifyServiceRequest(request:Request, secret:string | undefined, body:string):Promise<void>{
  if(!secret||secret.length<64)throw new CatalogError(503,'服務驗證尚未配置');
  const timestamp=request.headers.get('X-Service-Time')||'',nonce=request.headers.get('X-Service-Nonce')||'',signature=request.headers.get('X-Service-Signature')||'';
  if(!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>120||!/^[a-f0-9]{32}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(signature))throw new Error('SERVICE_UNAUTHORIZED');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(body)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const url=new URL(request.url),message=[request.method,url.pathname+url.search,timestamp,nonce,hash].join('\n');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=new Uint8Array(signature.match(/../g)!.map(hex=>parseInt(hex,16)));
  if(!await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(message)))throw new Error('SERVICE_UNAUTHORIZED');
}
