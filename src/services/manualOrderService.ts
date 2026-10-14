import { adminFetch } from './adminApi';
import type { ManualOrderInput } from '../../sheet-order-api/src/services/ManualOrderContract';
import { manualOrderInputSchema } from '../../sheet-order-api/src/services/ManualOrderContract';
export type { ManualOrderInput };
export interface ManualProduct { id:string;name:string;price:number;unit?:string;stock_quantity:number;stock_status:string;is_active:boolean }
export interface ManualOptions { products:ManualProduct[]; delivery:{delivery_period:{start_date:string;end_date:string};delivery_rules:{home_delivery:{advance_days:number;exclude_sunday:boolean};store_pickup:{advance_days:number;exclude_sunday:boolean}}};revision:number;readOnly:boolean }
export interface ManualReceipt {success:boolean;order_id?:string;message?:string;sms_sent?:boolean;reused?:boolean;safe_to_restart?:boolean;customer_sync_pending?:boolean;stock_confirmation_pending?:boolean}
export interface ManualStore {id:string;name:string;address:string}
let active:{email:string;input:ManualOrderInput;fingerprint:string}|null=null;
let completed:{email:string;fingerprint:string;receipt:ManualReceipt}|null=null;
let inFlight:Promise<ManualReceipt>|null=null;
const key=(email:string)=>`lopokao-manual-request:${email}`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function metadata(email:string):{id:string;fingerprint:string}|null {
 const raw=sessionStorage.getItem(key(email));if(raw===null)return null;
 let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('待確認訂單識別無法核對，請到待辦對帳處理');}
 if(!parsed||!uuid.test(parsed.id||'')||!/^[a-f0-9]{64}$/.test(parsed.fingerprint||''))throw new Error('待確認訂單識別無法核對，請到待辦對帳處理');
 return parsed;
}
export const hasManualPending=(email:string)=>sessionStorage.getItem(key(email))!==null;
async function fingerprint(input:ManualOrderInput):Promise<string>{
 const {requestId:_id,catalogRevision:_revision,...fields}=input.order;
 const products=Object.fromEntries(Object.entries(fields.products).sort(([a],[b])=>a.localeCompare(b)));
 const ordered=Object.fromEntries(Object.entries({...fields,products}).sort(([a],[b])=>a.localeCompare(b)));
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({order:ordered,send_sms:input.send_sms})));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function json(response:Response):Promise<Record<string,unknown>>{
 if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('服務回應尚無法核對，請保留原單');
 try{return await response.json();}catch{throw new Error('服務回應尚無法核對，請保留原單');}
}
export async function getManualOptions():Promise<ManualOptions>{
 const response=await adminFetch('/manual-orders/options'),result=await json(response);
 const data=result.data as Pick<ManualOptions,'products'|'delivery'>|undefined;
 if(!response.ok||result.success!==true||!data||!Array.isArray(data.products)||!data.delivery||!Number.isInteger(result.revision))throw new Error('手抄單設定目前無法讀取，請重新載入');
 return {...data,revision:result.revision as number,readOnly:result.read_only!==false};
}
export async function searchManualStores(query:string,signal?:AbortSignal):Promise<ManualStore[]>{
 const response=await adminFetch(`/manual-orders/stores?query=${encodeURIComponent(query.trim())}`,{signal}),result=await json(response);
 if(!response.ok||result.success!==true||!Array.isArray(result.data))throw new Error('門市搜尋暫時無法完成，請稍後再試');
 return result.data as ManualStore[];
}
export async function recoverManualDraft(email:string):Promise<ManualOrderInput|null>{
 const saved=metadata(email);if(!saved)return null;
 if(active?.email===email&&active.input.order.requestId===saved.id)return active.input;
 const response=await adminFetch(`/manual-orders/status?id=${encodeURIComponent(saved.id)}`),result=await json(response);
 const input=result.data as ManualOrderInput|undefined;
 if(!response.ok||result.success!==true||input?.order?.requestId!==saved.id||await fingerprint(input)!==saved.fingerprint)throw new Error('原單資料尚無法恢復，請保留原頁或到待辦對帳處理');
 active={email,input:JSON.parse(JSON.stringify(input)),fingerprint:saved.fingerprint};return active.input;
}
export async function submitManualOrder(email:string,order:Omit<ManualOrderInput['order'],'requestId'>,sendSms:boolean):Promise<ManualReceipt>{
 const saved=metadata(email);const input:ManualOrderInput={order:{...order,requestId:saved?.id||crypto.randomUUID()},send_sms:sendSms};
 if(!manualOrderInputSchema.safeParse(input).success)throw new Error('請確認手抄單欄位、日期與商品數量');
 const hash=await fingerprint(input);
 if(saved&&saved.fingerprint!==hash)throw new Error('上一筆結果尚待確認，請核對原單，勿變更內容建立新單');
 if(completed?.email===email&&completed.fingerprint===hash)return {...completed.receipt,reused:true};
 if(inFlight){if(active?.email!==email||active.fingerprint!==hash)throw new Error('另一筆手抄單仍在處理');return inFlight;}
 sessionStorage.setItem(key(email),JSON.stringify({id:input.order.requestId,fingerprint:hash}));
 active={email,input:JSON.parse(JSON.stringify(input)),fingerprint:hash};
 inFlight=sendActive();try{return await inFlight;}finally{inFlight=null;}
}
async function sendActive():Promise<ManualReceipt>{
 const pending=active;if(!pending)throw new Error('沒有可核對的原單');
 const response=await adminFetch('/manual-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.input)});
 const raw=await json(response);
 if(typeof raw.success!=='boolean')throw new Error('入單結果尚待確認，請核對原單');
 const result=raw as unknown as ManualReceipt;
 if(response.ok&&result.success===true&&result.order_id===pending.input.order.requestId){sessionStorage.removeItem(key(pending.email));active=null;completed={email:pending.email,fingerprint:pending.fingerprint,receipt:result};return result;}
 if(response.status===400&&result.success===false&&result.safe_to_restart===true){sessionStorage.removeItem(key(pending.email));active=null;}
 const message=typeof result.message==='string'&&!/[<>]/.test(result.message)?result.message:'入單結果尚待確認，請保留原單並核對';
 throw new Error(message);
}
export async function retryManualOrder(email:string):Promise<ManualReceipt>{
 if(inFlight){if(active?.email!==email)throw new Error('另一位管理員的手抄單仍在處理');return inFlight;}
 const original=await recoverManualDraft(email);if(!original)throw new Error('沒有可核對的原單');
 inFlight=sendActive();try{return await inFlight;}finally{inFlight=null;}
}
export function beginAnotherManualOrder(email:string):void{
 if(hasManualPending(email)||inFlight)throw new Error('上一筆結果尚待確認');
 active=null;completed=null;
}
