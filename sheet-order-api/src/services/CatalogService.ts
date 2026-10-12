export class CatalogError extends Error {
  constructor(public status: 400 | 404 | 409 | 503, message: string) { super(message); }
}
export interface CatalogProduct extends Record<string, unknown> {
  id: string; name: string; price: number; stock_quantity: number;
  stock_status: 'available' | 'limited' | 'sold_out'; is_active: boolean;
}
export interface DeliveryRules extends Record<string, unknown> {
  delivery_period: { start_date: string; end_date: string; description?: string; updated_by?: string; updated_at?: string };
  delivery_rules: Record<'home_delivery' | 'store_pickup', { exclude_sunday: boolean; advance_days: number; description?: string }>;
}
export interface CatalogPayload { products: CatalogProduct[]; delivery: DeliveryRules }
export interface CatalogSnapshot extends CatalogPayload { revision: number; read_only: boolean }
interface ReservationRow { id: string; fingerprint: string; quantities: string; snapshot: string; state: string }
const fail = (message: string): never => { throw new CatalogError(400, message); };
export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail('設定版本格式錯誤');
  return value as number;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('資料格式錯誤');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (required && !value.trim())) fail('文字欄位格式錯誤');
  return value as string;
}
function integer(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) fail('數量必須是有效整數');
  return value as number;
}
function bool(value: unknown): boolean { if (typeof value !== 'boolean') fail('開關格式錯誤'); return value as boolean; }
export function validateProduct(value: unknown, previous?: CatalogProduct): CatalogProduct {
  const input = record(value), p: Record<string, unknown> = { ...(previous || {}), ...input };
  const allowed = ['id','name','price','stock_quantity','stock_status','is_active','description','detailed_description','image','ingredients','weight','unit','is_vegetarian','shipping_note','sort_order','category'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) fail('不支援的商品欄位');
  if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id) || ['__proto__','constructor','prototype'].includes(p.id) || (previous && p.id !== previous.id)) fail('商品 ID 不可變更');
  p.name = text(p.name, 150, true);
  if (typeof p.price !== 'number' || !Number.isFinite(p.price) || p.price <= 0 || p.price > 100000 || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.00001) fail('價格須為有效金額');
  p.stock_quantity = integer(p.stock_quantity, 1000000);
  if (!['available','limited','sold_out'].includes(String(p.stock_status))) fail('庫存狀態格式錯誤');
  p.is_active = bool(p.is_active);
  for (const key of ['description','detailed_description','weight','unit','shipping_note','category']) if (p[key] !== undefined) p[key] = text(p[key], key === 'detailed_description' ? 10000 : 2000);
  if (p.is_vegetarian !== undefined) p.is_vegetarian = bool(p.is_vegetarian);
  if (p.sort_order !== undefined) p.sort_order = integer(p.sort_order, 10000);
  if (p.image !== undefined) {
    p.image = text(p.image, 2048);
    if (p.image && !(String(p.image).startsWith('https://') || /^\/(?!\/)/.test(String(p.image)))) fail('圖片網址須使用 HTTPS 或本站路徑');
  }
  if (p.ingredients !== undefined && (!Array.isArray(p.ingredients) || p.ingredients.length > 100)) fail('成分格式錯誤');
  if (Array.isArray(p.ingredients)) p.ingredients = p.ingredients.map(i => text(i, 100));
  p.updated_at = new Date().toISOString();
  return p as CatalogProduct;
}
export function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function validateDelivery(value: unknown, previous: DeliveryRules, actor: string): DeliveryRules {
  const input = record(value);
  if (Object.keys(input).some(k => !['start_date','end_date','description','exclude_home_sunday','exclude_store_sunday','home_advance_days','store_advance_days'].includes(k))) fail('不支援的配送欄位');
  const start=text(input.start_date,10),end=text(input.end_date,10);
  if (!validDate(start) || !validDate(end) || end < start || Date.parse(end)-Date.parse(start)>366*86400000) fail('日期範圍須為有效且在一年內');
  return { ...previous, delivery_period: { ...previous.delivery_period, start_date:start, end_date:end, description:text(input.description ?? '',2000), updated_by:actor, updated_at:new Date().toISOString() }, delivery_rules: {
    home_delivery:{...previous.delivery_rules.home_delivery,exclude_sunday:bool(input.exclude_home_sunday),advance_days:integer(input.home_advance_days ?? previous.delivery_rules.home_delivery.advance_days,365)},
    store_pickup:{...previous.delivery_rules.store_pickup,exclude_sunday:bool(input.exclude_store_sunday),advance_days:integer(input.store_advance_days ?? previous.delivery_rules.store_pickup.advance_days,365)},
  }};
}
export function visibleProducts(products: CatalogProduct[], all = false): CatalogProduct[] {
  return products.filter(p => all || p.is_active).map<CatalogProduct>(p => ({...p,stock_status:p.stock_status==='sold_out'||p.stock_quantity===0?'sold_out':p.stock_status})).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0));
}
export class CatalogService {
  constructor(private db: D1Database) { if (!db) throw new CatalogError(503,'設定資料服務尚未配置'); }
  async snapshot(): Promise<CatalogSnapshot> {
    // No unconstrained sessions: these queries use the primary database.
    const row = await this.db.prepare('SELECT revision,payload,write_ready FROM catalog_state WHERE id=1').first<{revision:number;payload:string;write_ready:number}>();
    if (!row) throw new CatalogError(503,'設定資料尚未匯入');
    return { ...JSON.parse(row.payload) as CatalogPayload, revision:row.revision,read_only:row.write_ready!==1 };
  }
  private mutation(s: CatalogSnapshot, kind: string, actor: string, details: unknown): D1PreparedStatement {
    // A NULL guard aborts the entire D1 batch when the revision/readiness/state is stale.
    return this.db.prepare(`INSERT INTO catalog_mutations(id,expected_revision,payload,kind,actor,details,created_at,guard) SELECT ?,?,?,?,?,?,?,CASE WHEN (SELECT revision FROM catalog_state WHERE id=1)=? AND (SELECT write_ready FROM catalog_state WHERE id=1)=1 AND (?!='stock_release' OR (SELECT state FROM stock_reservations WHERE id=json_extract(?,'$.id'))='reserved') THEN 1 ELSE NULL END`).bind(crypto.randomUUID(),s.revision,JSON.stringify({products:s.products,delivery:s.delivery}),kind,actor,JSON.stringify(details),new Date().toISOString(),s.revision,kind,JSON.stringify(details));
  }
  private async commit(s: CatalogSnapshot, kind: string, actor: string, details: unknown, extra: D1PreparedStatement[] = []): Promise<void> {
    if(s.read_only)throw new CatalogError(503,'前後台切換尚未完成，暫停修改');
    if(new TextEncoder().encode(JSON.stringify({products:s.products,delivery:s.delivery})).byteLength>262144)fail('設定內容過大，請減少描述內容');
    try { await this.db.batch([this.mutation(s,kind,actor,details),this.db.prepare('UPDATE catalog_state SET payload=?,revision=revision+1,updated_at=? WHERE id=1').bind(JSON.stringify({products:s.products,delivery:s.delivery}),new Date().toISOString()),...extra]); }
    catch (e) { if (/NOT NULL constraint failed: catalog_mutations.guard/.test(String(e))) throw new CatalogError(409,'設定或庫存已更新，請重新載入後再操作'); throw e; }
  }
  async saveProduct(id: string, value: unknown, expected: unknown, actor: string, create = false): Promise<CatalogSnapshot> {
    const s = await this.snapshot(); if (s.revision !== revision(expected)) throw new CatalogError(409,'設定或庫存已更新，請重新載入');
    const index=s.products.findIndex(p=>p.id===id);
    if (create && index!==-1) throw new CatalogError(409,'商品 ID 已存在');
    if (!create && index===-1) throw new CatalogError(404,'找不到商品');
    if (create && s.products.length>=100) fail('商品數量已達上限');
    const p=validateProduct({...record(value),id},index<0?undefined:s.products[index]);
    if(index<0)s.products.push({...p,created_at:new Date().toISOString()});else s.products[index]=p;
    await this.commit(s,create?'product_create':'product_update',actor,{id});
    return {...s,revision:s.revision+1};
  }
  async saveDelivery(value: unknown, expected: unknown, actor: string): Promise<CatalogSnapshot> {
    const s=await this.snapshot();if(s.revision!==revision(expected))throw new CatalogError(409,'設定已更新，請重新載入');
    s.delivery=validateDelivery(value,s.delivery,actor);await this.commit(s,'delivery_update',actor,{});return {...s,revision:s.revision+1};
  }
  async reservation(id: string): Promise<ReservationRow | null> {return this.db.prepare('SELECT id,fingerprint,quantities,snapshot,state FROM stock_reservations WHERE id=?').bind(id).first<ReservationRow>();}
  /** Application order mutations share the same primary transaction as checkout stock. */
  async orderCommit(delta:Record<string,number>,actor:string,operationId:string,statements:D1PreparedStatement[]):Promise<void>{
    if(!Object.values(delta).some(n=>n!==0)){await this.db.batch(statements);return;}
    const s=await this.snapshot();
    for(const [id,n]of Object.entries(delta)){
      if(!Number.isSafeInteger(n))fail('庫存異動格式錯誤');const p=s.products.find(p=>p.id===id);
      if(!p)throw new CatalogError(409,'商品庫存需先核對');
      if(n<0&&(!p.is_active||p.stock_status==='sold_out'||p.stock_quantity+n<0))throw new CatalogError(409,'商品停售或庫存不足');
      if(p.stock_quantity+n<0||p.stock_quantity+n>1000000)throw new CatalogError(409,'庫存異動超出範圍');p.stock_quantity+=n;
    }
    await this.commit(s,'admin_order_stock',actor,{operation_id:operationId,delta},statements);
  }
  async reserve(value: unknown): Promise<{id:string;state:string;snapshot:CatalogSnapshot;reused:boolean}> {
    const input=record(value);const id=text(input.id,64,true),fingerprint=text(input.fingerprint,64,true);
    if(!/^[a-f0-9-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(fingerprint))fail('訂單識別格式錯誤');
    const existing=await this.reservation(id);
    if(existing){if(existing.fingerprint!==fingerprint||existing.state==='released')throw new CatalogError(409,'訂單識別已使用');return {id,state:existing.state,snapshot:JSON.parse(existing.snapshot),reused:true};}
    const s=await this.snapshot();if(s.revision!==revision(input.revision))throw new CatalogError(409,'商品或日期已更新，請重新確認訂單');
    const quantities=record(input.products);if(Object.keys(quantities).length>50)fail('商品數量格式錯誤');let cents=0,count=0;
    for(const [key,v] of Object.entries(quantities)) {const n=integer(v,100);if(!n)continue;const p=s.products.find(p=>p.id===key);if(!p||!p.is_active||p.stock_status==='sold_out'||p.stock_quantity<n)throw new CatalogError(409,'商品已停售或庫存不足');cents+=Math.round(p.price*100)*n;count+=n;}
    if(count<1||count>500)fail('請選擇有效商品數量');
    const shipping=cents>=35000?0:10000;if(input.shipping!==shipping/100||input.total_amount!==(cents+shipping)/100)throw new CatalogError(409,'商品價格或運費已更新');
    const date=input.preferred_date,method=input.delivery_method;
    const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),period=s.delivery.delivery_period;
    const rule=method==='宅配到府'?s.delivery.delivery_rules.home_delivery:method==='7-11門市'?s.delivery.delivery_rules.store_pickup:null;
    if(!rule||!validDate(date)||date<today||date<period.start_date||date>period.end_date||Date.parse(date)<Date.parse(today)+rule.advance_days*86400000||(rule.exclude_sunday&&new Date(date).getUTCDay()===0))throw new CatalogError(409,'到貨日期已更新或不可選');
    const before=structuredClone(s);for(const p of s.products)p.stock_quantity-=Number(quantities[p.id]||0);
    const now=new Date().toISOString();
    try{await this.commit(s,'stock_reserve','checkout',{id,quantities},[this.db.prepare('INSERT INTO stock_reservations(id,fingerprint,quantities,snapshot,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(id,fingerprint,JSON.stringify(quantities),JSON.stringify(before),'reserved',now,now)]);}
    catch(e){const winner=await this.reservation(id);if(winner&&winner.fingerprint===fingerprint&&winner.state!=='released')return {id,state:winner.state,snapshot:JSON.parse(winner.snapshot),reused:true};throw e;}
    return {id,state:'reserved',snapshot:before,reused:false};
  }
  async transition(id: string, fingerprint: string, state: 'submitting'|'confirmed'): Promise<void> {
    const r=await this.reservation(id);if(!r||r.fingerprint!==fingerprint)throw new CatalogError(404,'找不到庫存預留');
    if(r.state==='released')throw new CatalogError(409,'預留已釋放');
    await this.db.prepare("UPDATE stock_reservations SET state=?,updated_at=? WHERE id=? AND state IN ('reserved','submitting')").bind(state,new Date().toISOString(),id).run();
  }
  // Only an unsubmitted reservation may be safely released automatically.
  async release(id:string,fingerprint:string):Promise<void>{
    const r=await this.reservation(id);if(!r||r.fingerprint!==fingerprint)throw new CatalogError(404,'找不到庫存預留');if(r.state==='released')return;
    if(r.state!=='reserved')throw new CatalogError(409,'已嘗試寫入訂單，需先完成對帳');
    const s=await this.snapshot(),q=JSON.parse(r.quantities) as Record<string,number>;
    for(const p of s.products)p.stock_quantity+=q[p.id]||0;
    await this.commit(s,'stock_release','checkout',{id},[this.db.prepare("UPDATE stock_reservations SET state='released',updated_at=? WHERE id=? AND state='reserved'").bind(new Date().toISOString(),id)]);
  }
}
