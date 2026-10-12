import {GoogleSheetsService} from './GoogleSheetsService';
import {OrderConflict,uuid,rowCells,type OrderRow} from './OrderContract';
/** Row metadata follows an order when Sheet rows move. Writes never include notes H. */
export class OrderSheets extends GoogleSheetsService {
 private selectedSheetId?:number;
 constructor(keyText:string,private sheetId:string,private sheetName:string){super(keyText,sheetId);}
 private async api<T>(path:string,method:string,body?:unknown):Promise<T>{
  const token=await this.getAccessToken();
  const r=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const reader=r.body?.getReader();if(!reader)throw new OrderConflict(503,'SHEETS_UNAVAILABLE','訂單服務暫時無法讀取');const chunks:Uint8Array[]=[];let size=0;
  for(;;){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>8388608){await reader.cancel();throw new OrderConflict(503,'SHEET_TOO_LARGE','訂單資料量超過安全範圍');}chunks.push(v.value);}
  const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
  if(!r.ok)throw new OrderConflict(503,'SHEETS_UNAVAILABLE','Google 訂單服務暫時無法完成操作');return JSON.parse(new TextDecoder().decode(raw)) as T;
 }
 private async selectedId():Promise<number>{
  if(this.selectedSheetId!==undefined)return this.selectedSheetId;
  const meta=await this.api<{sheets:Array<{properties:{sheetId:number;title:string}}>}>('?fields=sheets(properties(sheetId,title))','GET');
  const matches=(meta.sheets??[]).filter(s=>s.properties.title===this.sheetName);
  if(matches.length!==1||!Number.isSafeInteger(matches[0]?.properties.sheetId)||matches[0]!.properties.sheetId<0)throw new OrderConflict(503,'SHEET_MISSING','找不到唯一的訂單工作表');
  this.selectedSheetId=matches[0]!.properties.sheetId;return this.selectedSheetId;
 }
 private async filter(id:string){return {developerMetadataLookup:{metadataKey:'lopokao_order_uuid',metadataValue:uuid.parse(id),visibility:'DOCUMENT',locationType:'ROW',metadataLocation:{sheetId:await this.selectedId()},locationMatchingStrategy:'INTERSECTING_LOCATION'}};}
 async rows():Promise<OrderRow[]>{const data=await this.api<{values?:unknown[][]}>('/values/'+encodeURIComponent("'"+this.sheetName.replace(/'/g,"''")+"'!A:R"),'GET');return (data.values??[]).map(rowCells);}
 async locate(id:string):Promise<OrderRow>{
  uuid.parse(id);const filter=await this.filter(id);let data=await this.api<MatchedRows>('/values:batchGetByDataFilter','POST',{dataFilters:[filter],valueRenderOption:'FORMATTED_VALUE'});
  if(!data.valueRanges?.length){
   const rows=await this.rows(),matches=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&x.r[16]===id);if(matches.length!==1)throw new OrderConflict(409,'ORDER_ID_MISMATCH','訂單識別不存在或重複，請重新載入');
   // Annotation only, no order values. On uncertain annotation results the next lookup checks identity.
   await this.api(':batchUpdate','POST',{requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:'lopokao_order_uuid',metadataValue:id,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:await this.selectedId(),dimension:'ROWS',startIndex:matches[0]!.i,endIndex:matches[0]!.i+1}}}}}]});
   data=await this.api<MatchedRows>('/values:batchGetByDataFilter','POST',{dataFilters:[filter],valueRenderOption:'FORMATTED_VALUE'});
  }
  const ranges=data.valueRanges??[],unique=new Set(ranges.map(r=>r.valueRange?.range));if(unique.size!==1||!ranges.length)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位需先核對');
  const selectedRange=ranges[0]!.valueRange?.range||'',quoted="'"+this.sheetName.replace(/'/g,"''")+"'!";
  if(!(selectedRange.startsWith(quoted)||selectedRange.startsWith(this.sheetName+'!'))||ranges[0]!.valueRange?.values?.length!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位不在指定工作表，停止修改');
  const row=rowCells(ranges[0]!.valueRange?.values?.[0]??[]);if(row[16]!==id)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位與識別不符，停止修改');return row;
 }
 async write(id:string,fields:Record<number,string|number>):Promise<void>{
  const values:Array<string|number|null>=Array(18).fill(null);
  for(const [col,value]of Object.entries(fields)){const n=Number(col);if(![8,9,14,15,17].includes(n))throw new OrderConflict(400,'COLUMN_NOT_ALLOWED','不允許修改此欄位');values[n]=value;}
  const result=await this.api<{totalUpdatedRows?:number}>('/values:batchUpdateByDataFilter','POST',{valueInputOption:'RAW',data:[{dataFilter:await this.filter(id),majorDimension:'ROWS',values:[values]}],includeValuesInResponse:false});
  if(result.totalUpdatedRows!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','寫入未能確認為唯一訂單，請先對帳');
 }
}
interface MatchedRows {
 valueRanges?:Array<{valueRange?:{range?:string;values?:Array<Array<string|number|null>>}}>;
}
