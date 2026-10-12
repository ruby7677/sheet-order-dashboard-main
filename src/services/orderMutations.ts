import type {OrderItem}from '@/types/order';
export interface MutationReceipt {success:boolean;id:string;revision:string;items?:OrderItem[];total?:number;warning?:string;message?:string;reused?:boolean;}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export async function mutateOrder(id:string,revision:string|undefined,intent:Record<string,unknown>):Promise<MutationReceipt>{
 if(!uuid.test(id)||!revision||!/^[a-f0-9]{64}$/.test(revision))throw new Error('訂單資料版本不足，請重新載入後再操作');
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({id,...intent}))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const key='lopokao-admin-operation:'+id;let saved:{operation_id:string;expected_revision:string;fingerprint:string}|null=null;
 try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}catch{throw new Error('操作紀錄無法確認，請先至待辦對帳頁核對');}
 if(saved&&saved.fingerprint!==fingerprint)throw new Error('此訂單先前操作結果尚未確認，請先對帳再修改');
 if(!saved){saved={operation_id:crypto.randomUUID(),expected_revision:revision,fingerprint};sessionStorage.setItem(key,JSON.stringify(saved));}
 const kind=String(intent.kind),path=kind==='delete'?'/api/orders':`/api/orders/${kind}`;
 const {kind:ignored,...fields}=intent;
 const res=await fetch(path,{method:kind==='delete'?'DELETE':kind==='pricing'?'POST':'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,...fields,expected_revision:saved.expected_revision,operation_id:saved.operation_id})});
 if(!(res.headers.get('content-type')||'').includes('application/json'))throw new Error('管理登入或操作结果尚待確認，請重新登入後核對');
 const data=await res.json();
 if(!res.ok||!data.success){
  // Only explicit pre-write rejections allow a different intent; ambiguity stays recorded.
  if(['INVALID_ORDER_MUTATION','STALE_ORDER','PRICE_SNAPSHOT_REQUIRED','PRICE_TOTAL_MISMATCH','ORDER_NOT_EDITABLE','ORDER_ARCHIVED','ORDER_MIGRATION_PENDING','DUPLICATE_PRODUCT','OPERATION_ID_REUSED','OPERATION_REJECTED','OPERATION_FORBIDDEN','ADMIN_RATE_LIMITED','ADMIN_LIMIT_UNAVAILABLE','CANCELLED_ORDER_CLOSED','ORDER_WRITE_BUSY','PRICING_ALREADY_CONFIRMED','UNKNOWN_PRODUCT','PRICE_MAPPING_REQUIRED','INVALID_AMOUNT','DELIVERY_RULE_REQUIRED','ORDER_STOCK_REJECTED'].includes(data.code))sessionStorage.removeItem(key);
  throw new Error(data.message||'操作結果尚待確認，請先對帳');
 }
 if(data.id!==id||typeof data.revision!=='string'||!/^[a-f0-9]{64}$/.test(data.revision))throw new Error('完成結果格式不符，請保留操作識別並先對帳');
 sessionStorage.removeItem(key);return data as MutationReceipt;
}
export function clearResolvedOperation(orderId:string):void{sessionStorage.removeItem('lopokao-admin-operation:'+orderId);}
