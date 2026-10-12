import {z} from 'zod';
export class OrderConflict extends Error {constructor(public status:number,public code:string,message:string){super(message);}}
export const uuid=z.string().uuid();
export const revision=z.string().regex(/^[a-f0-9]{64}$/);
export const statuses=['訂單確認中','已抄單','已出貨','取消訂單'] as const;
export const payments=['未收費','已收費','待轉帳','未全款','特殊',''] as const;
export const OrderColumn={timestamp:0,customerName:1,phone:2,deliveryMethod:3,address:4,preferredDate:5,preferredTime:6,notes:7,items:8,totalAmount:9,contactMethod:10,socialAccount:11,paymentMethod:12,legacyRow:13,status:14,paymentStatus:15,uuid:16,archivedAt:17} as const;
const base={id:uuid,expected_revision:revision,operation_id:uuid};
export const mutation=z.discriminatedUnion('kind',[
 z.object({...base,kind:z.literal('status'),status:z.enum(statuses)}).strict(),
 z.object({...base,kind:z.literal('payment'),status:z.enum(payments)}).strict(),
 z.object({...base,kind:z.literal('delete')}).strict(),
 z.object({...base,kind:z.literal('items'),items:z.array(z.object({product_id:z.string().min(1).max(64),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(50)}).strict(),
 z.object({...base,kind:z.literal('pricing'),prices:z.array(z.object({product:z.string().min(1).max(100),product_id:z.string().min(1).max(64),unit_price:z.number().min(0).max(100000)}).strict()).min(1).max(50),shipping:z.number().min(0).max(10000),reason:z.string().trim().min(3).max(300)}).strict(),
]);
export type Mutation=z.infer<typeof mutation>;
export interface PricedItem {product_id:string;product:string;quantity:number;unit_price:number;price:number;subtotal:number;}
export interface InventoryProof {prices:Record<string,{name:string;price:number}>;quantities:Record<string,number>;allocations:Record<string,number>;historical:boolean;restored:boolean;shipping:number;has_shipped?:boolean;}
export type OrderRow=[string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string];
export function rowCells(input:ReadonlyArray<unknown>):OrderRow {const v=(i:number)=>String(input[i]??'');return [v(0),v(1),v(2),v(3),v(4),v(5),v(6),v(7),v(8),v(9),v(10),v(11),v(12),v(13),v(14),v(15),v(16),v(17)];}
export async function rowRevision(input:string[]):Promise<string>{const v=rowCells(input);v[7]='';return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function sheetItems(value:string):Array<{product:string;quantity:number}>{
 const items=value.split(/[,，]/).filter(x=>x.trim()).map(x=>{const m=x.trim().match(/^(.+?)\s*[xX×]\s*([1-9][0-9]{0,2})$/);if(!m||Number(m[2])>100)throw new OrderConflict(409,'HISTORICAL_ITEMS_UNRECOGNIZED','商品紀錄需先核對，請勿猜測數量');return {product:m[1]!.trim(),quantity:Number(m[2])};});
 if(!items.length||items.length>50)throw new OrderConflict(409,'ITEMS_UNRECOGNIZED','商品紀錄需先核對');return items;
}
export function cents(value:unknown):number {const n=Number(value);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>0.000001)throw new OrderConflict(400,'INVALID_AMOUNT','金額須為非負數且最多兩位小數');return Math.round(n*100);}
export function pricedItems(proof:InventoryProof):PricedItem[]{return Object.entries(proof.quantities).filter(([,q])=>q>0).map(([id,q])=>{const p=proof.prices[id];if(!p)throw new OrderConflict(409,'PRICE_SNAPSHOT_REQUIRED','缺少成交單價，請先確認歷史單價');return {product_id:id,product:p.name,quantity:q,unit_price:p.price,price:p.price,subtotal:cents(p.price)*q/100};});}
export function total(proof:InventoryProof):number{return (pricedItems(proof).reduce((s,i)=>s+cents(i.price)*i.quantity,0)+cents(proof.shipping))/100;}
/** Only quantities with proof of an application deduction may be returned. */
export function inventoryChange(proof:InventoryProof,input:Mutation,status:string,deliveryMethod='宅配到府'):{next:InventoryProof;delta:Record<string,number>;warning?:string}{
 const next=structuredClone(proof),delta:Record<string,number>={};
 if(input.kind==='items'){
  if(status==='已出貨'||status==='取消訂單'||proof.has_shipped||proof.restored)throw new OrderConflict(409,'ORDER_NOT_EDITABLE','已出貨或取消的訂單不能修改商品');
  const q:Record<string,number>={};for(const item of input.items){if(q[item.product_id]!==undefined)throw new OrderConflict(400,'DUPLICATE_PRODUCT','商品不得重複');if(!proof.prices[item.product_id])throw new OrderConflict(409,'PRICE_SNAPSHOT_REQUIRED','新商品須先確認成交單價');q[item.product_id]=item.quantity;}
  for(const id of new Set([...Object.keys(proof.quantities),...Object.keys(q)])){
   const difference=(q[id]||0)-(proof.quantities[id]||0),allocated=proof.allocations[id]||0;
   if(difference>0){delta[id]=-difference;next.allocations[id]=allocated+difference;}
   else if(difference<0){const returned=Math.min(allocated,-difference);if(returned)delta[id]=returned;next.allocations[id]=allocated-returned;}
  }
  next.quantities=q;const subtotal=pricedItems(next).reduce((s,i)=>s+cents(i.price)*i.quantity,0);
  if(['門市取貨','來店自取'].includes(deliveryMethod))next.shipping=0;
  else if(['宅配到府','7-11門市'].includes(deliveryMethod))next.shipping=subtotal>=35000?0:100;
  else throw new OrderConflict(409,'DELIVERY_RULE_REQUIRED','歷史配送方式需先核對，暫停修改商品');
 }else if(input.kind==='delete'||(input.kind==='status'&&input.status==='取消訂單')){
  if(status!=='已出貨'&&!proof.has_shipped&&!proof.restored){for(const [id,q]of Object.entries(proof.allocations))if(q>0)delta[id]=q;next.allocations={};next.restored=true;}
 }else if(input.kind==='status'&&status==='取消訂單'&&input.status!=='取消訂單'){
  throw new OrderConflict(409,'CANCELLED_ORDER_CLOSED','已取消訂單不能直接恢復，請建立新訂單');
 }
 if(input.kind==='status'&&input.status==='已出貨')next.has_shipped=true;
 return {next,delta,...(proof.historical&&(input.kind==='delete'||(input.kind==='status'&&input.status==='取消訂單'))?{warning:'歷史訂單原始庫存不自動回補，請人工盤點；僅回補可驗證的後續追加扣庫存量。'}:{})};
}
