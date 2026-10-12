import { adminFetch } from './adminApi';
import type { StockStatus } from '@/utils/stockStatusUtils';

export interface SettingsResult<T> { data:T; revision:number; readOnly:boolean }
export interface SettingsProduct {
  id: string; product_id: string; name: string; price: number; weight?: string | number;
  unit: string; description?: string; detailed_description?: string; ingredients?: string;
  image_url?: string; is_vegetarian: boolean; shipping_note?: string; sort_order: number;
  stock_quantity: number; is_active: boolean; stock_status: StockStatus; category: string;
  created_at?: string; updated_at?: string;
}
export interface DeliverySetting {
  id: string; start_date: string; end_date: string; description?: string; is_active: boolean;
  updated_by?: string; updated_at?: string; excludeHomeSunday?: boolean; excludeStoreSunday?: boolean;
  homeAdvanceDays?: number; storeAdvanceDays?: number;
}
async function read(endpoint: string): Promise<{data:unknown;revision:number;read_only:boolean}> {
  const response = await adminFetch(endpoint);
  if (!response.ok) throw new Error('無法載入目前設定');
  const result = await response.json();
  if (!result.success) throw new Error('無法載入目前設定');
  return result;
}
export async function listSettingsProducts(): Promise<SettingsResult<SettingsProduct[]>> {
  const result = await read('/settings/products'),values=result.data;
  if (!Array.isArray(values)) throw new Error('商品資料格式錯誤');
  return { revision:result.revision,readOnly:result.read_only!==false,data:values.map((p: Record<string, unknown>) => ({
    id: String(p.id), product_id: String(p.id), name: String(p.name || ''), price: Number(p.price),
    weight: typeof p.weight === 'number' || typeof p.weight === 'string' ? p.weight : undefined,
    unit: String(p.unit || '條'), description: String(p.description || ''), detailed_description: String(p.detailed_description || ''),
    ingredients: Array.isArray(p.ingredients) ? p.ingredients.join('、') : String(p.ingredients || ''),
    image_url: String(p.image || ''), is_vegetarian: Boolean(p.is_vegetarian), shipping_note: String(p.shipping_note || ''),
    sort_order: Number(p.sort_order || 0), stock_quantity: Number(p.stock_quantity || 0), is_active: Boolean(p.is_active),
    stock_status: p.stock_status === 'sold_out' ? 'out_of_stock' : p.stock_status === 'limited' ? 'low_stock' : 'in_stock',
    category: String(p.category || ''), created_at: String(p.created_at || ''), updated_at: String(p.updated_at || ''),
  })) };
}
export async function getDeliverySetting(): Promise<SettingsResult<DeliverySetting>> {
  const result=await read('/settings/delivery');
  const value = result.data as { delivery_period?: Record<string, unknown>; delivery_rules?: { home_delivery?: { exclude_sunday?: boolean;advance_days?:number }; store_pickup?: { exclude_sunday?: boolean;advance_days?:number } } };
  const p = value?.delivery_period;
  if (!p || typeof p.start_date !== 'string' || typeof p.end_date !== 'string') throw new Error('到貨日期資料格式錯誤');
  return { revision:result.revision,readOnly:result.read_only!==false,data:{ id: 'current', start_date: p.start_date, end_date: p.end_date, description: String(p.description || ''), is_active: true,
    updated_by: String(p.updated_by || ''), updated_at: String(p.updated_at || ''),
    excludeHomeSunday: value.delivery_rules?.home_delivery?.exclude_sunday ?? true,
    excludeStoreSunday: value.delivery_rules?.store_pickup?.exclude_sunday ?? false,
    homeAdvanceDays:value.delivery_rules?.home_delivery?.advance_days??0,storeAdvanceDays:value.delivery_rules?.store_pickup?.advance_days??0 } };
}
async function write(endpoint:string,method:string,input:unknown):Promise<void>{
  const response=await adminFetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const result=await response.json();
  if(!response.ok||!result.success)throw new Error(result.message||'儲存失敗，請重新載入確認');
}
export async function saveSettingsProduct(p:Partial<SettingsProduct>,expected:number,create=false):Promise<void>{
  const product={id:p.product_id,name:p.name,price:p.price,weight:String(p.weight??''),unit:p.unit,description:p.description||'',detailed_description:p.detailed_description||'',ingredients:(p.ingredients||'').split('、').map(s=>s.trim()).filter(Boolean),image:p.image_url||'',is_vegetarian:p.is_vegetarian||false,shipping_note:p.shipping_note||'',sort_order:p.sort_order||0,stock_quantity:p.stock_quantity,is_active:p.is_active!==false,stock_status:p.stock_status==='out_of_stock'?'sold_out':p.stock_status==='low_stock'?'limited':'available',category:p.category||''};
  await write(create?'/settings/products':'/settings/products/'+encodeURIComponent(String(p.product_id)),create?'POST':'PUT',{product,expected_revision:expected});
}
export async function deleteSettingsProduct(id:string,expected:number):Promise<void>{await write('/settings/products/'+encodeURIComponent(id),'DELETE',{expected_revision:expected});}
export async function updateSettingsStock(id:string,status:StockStatus,quantity:number,expected:number):Promise<void>{await write('/settings/products/'+encodeURIComponent(id),'PUT',{product:{stock_status:status==='out_of_stock'?'sold_out':status==='low_stock'?'limited':'available',stock_quantity:quantity},expected_revision:expected});}
export async function saveDeliverySetting(settings:unknown,expected:number):Promise<void>{await write('/settings/delivery','PUT',{settings,expected_revision:expected});}
