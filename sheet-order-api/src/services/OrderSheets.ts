import {GoogleSheetsService} from './GoogleSheetsService';
import {OrderConflict,uuid,rowCells,type OrderRow} from './OrderContract';
/** Row metadata follows an order when Sheet rows move. Writes never include notes H except an explicit delete clear. */
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
 private parseRange(range:string|undefined):{rowNumber:number;endColumn:number}|null{
  if(!range)return null;
  const quoted="'"+this.sheetName.replace(/'/g,"''")+"'!",bare=this.sheetName+'!';
  const prefix=range.startsWith(quoted)?quoted:range.startsWith(bare)?bare:null;if(!prefix)return null;
  const m=range.slice(prefix.length).match(/^([A-Z]+)([1-9][0-9]*):([A-Z]+)([1-9][0-9]*)$/i);if(!m)return null;
  const col=(letters:string)=>[...letters.toUpperCase()].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
  const startRow=Number(m[2]),endRow=Number(m[4]),endColumn=col(m[3]!);
  if(m[1]!.toUpperCase()!=='A'||startRow!==endRow||endColumn<18)return null;
  return {rowNumber:startRow,endColumn};
 }
 private parseSingleMatch(data:MatchedRows,id:string,allowBlank:boolean):OrderRow{
  const ranges=data.valueRanges??[];if(ranges.length!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位需先核對');
  const valueRange=ranges[0]!.valueRange,location=this.parseRange(valueRange?.range);if(!location)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位不在指定工作表，停止修改');
  const values=valueRange?.values;
  if(values!==undefined&&values.length!==0&&values.length!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位回傳多列，停止修改');
  if(values?.length===1&&!Array.isArray(values[0]))throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單列格式不正確，停止修改');
  const row=rowCells(values?.[0]??[]),blank=row.every(cell=>cell==='');
  if(allowBlank)return row;
  if(row[16]!==id)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','訂單定位與識別不符，停止修改');
  return row;
 }
 async rows():Promise<OrderRow[]>{const data=await this.api<{values?:unknown[][]}>('/values/'+encodeURIComponent("'"+this.sheetName.replace(/'/g,"''")+"'!A:R"),'GET');return (data.values??[]).map(rowCells);}
 async locate(id:string):Promise<OrderRow>{
  uuid.parse(id);const filter=await this.filter(id);let data=await this.api<MatchedRows>('/values:batchGetByDataFilter','POST',{dataFilters:[filter],valueRenderOption:'FORMATTED_VALUE'});
  if(!data.valueRanges?.length){
   const rows=await this.rows(),matches=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&x.r[16]===id);if(matches.length!==1)throw new OrderConflict(409,'ORDER_ID_MISMATCH','訂單識別不存在或重複，請重新載入');
   // Annotation only, no order values. On uncertain annotation results the next lookup checks identity.
   await this.api(':batchUpdate','POST',{requests:[{createDeveloperMetadata:{developerMetadata:{metadataKey:'lopokao_order_uuid',metadataValue:id,visibility:'DOCUMENT',location:{dimensionRange:{sheetId:await this.selectedId(),dimension:'ROWS',startIndex:matches[0]!.i,endIndex:matches[0]!.i+1}}}}}]});
   data=await this.api<MatchedRows>('/values:batchGetByDataFilter','POST',{dataFilters:[filter],valueRenderOption:'FORMATTED_VALUE'});
  }
  return this.parseSingleMatch(data,id,false);
 }
 /** Delete-only lookup: never creates metadata; returns only the unique UUID metadata row for operation-layer identity and full-row checks. */
 async locateForDelete(id:string):Promise<OrderRow>{
  uuid.parse(id);const data=await this.api<MatchedRows>('/values:batchGetByDataFilter','POST',{dataFilters:[await this.filter(id)],valueRenderOption:'FORMATTED_VALUE'});
  return this.parseSingleMatch(data,id,true);
 }
 async write(id:string,fields:Record<number,string|number>):Promise<void>{
  const values:Array<string|number|null>=Array(18).fill(null);
  for(const [col,value]of Object.entries(fields)){const n=Number(col);if(![8,9,14,15,17].includes(n))throw new OrderConflict(400,'COLUMN_NOT_ALLOWED','不允許修改此欄位');values[n]=value;}
  const result=await this.api<{totalUpdatedRows?:number}>('/values:batchUpdateByDataFilter','POST',{valueInputOption:'RAW',data:[{dataFilter:await this.filter(id),majorDimension:'ROWS',values:[values]}],includeValuesInResponse:false});
  if(result.totalUpdatedRows!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','寫入未能確認為唯一訂單，請先對帳');
 }
 /** Clear A:R by the UUID metadata filter, then verify the full row including manual notes H. */
 async clearOrder(id:string):Promise<void>{
  const before=await this.locateForDelete(id);if(before.every(cell=>cell===''))return;
  if(before[16]!==id)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','刪除列識別不符，停止清除');
  const result=await this.api<{totalUpdatedRows?:number}>('/values:batchUpdateByDataFilter','POST',{valueInputOption:'RAW',data:[{dataFilter:await this.filter(id),majorDimension:'ROWS',values:[Array(18).fill('')]}],includeValuesInResponse:false});
  if(result.totalUpdatedRows!==1)throw new OrderConflict(409,'ORDER_METADATA_CONFLICT','刪除清除結果需先對帳');
  const after=await this.locateForDelete(id);if(!after.every(cell=>cell===''))throw new OrderConflict(409,'ORDER_CLEAR_INCOMPLETE','訂單欄位未能全部清空，請人工核對');
 }
}
interface MatchedRows {
 valueRanges?:Array<{valueRange?:{range?:string;values?:Array<Array<string|number|null>>}}>;
}
