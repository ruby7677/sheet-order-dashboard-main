import {beforeEach,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../adminApi',()=>({adminFetch:request}));
const email='ruby7677@gmail.com';
const order={catalogRevision:1,customerName:'Synthetic customer',phone:'0900000000',deliveryMethod:'來店自取' as const,district:'',area:'',address:'雲林縣西螺鎮中山路302-3號（戶政事務所跟西光幼稚園中間）',storeName:'',storeAddress:'',storeId:'',preferredDate:'2026-10-21',preferredTime:'不指定' as const,contactMethod:'電話' as const,socialAccount:'',paymentMethod:'銀行轉帳' as const,paymentStatus:'未收費' as const,notes:'Synthetic',products:{fixture:1},totalAmount:100,shipping:0};
beforeEach(()=>{vi.resetModules();vi.stubGlobal('crypto',webcrypto);sessionStorage.clear();request.mockReset();});
describe('manual order transport',()=>{
 it('retains identity and original input after unknown results, stores no customer payload',async()=>{
  const service=await import('../manualOrderService');request.mockRejectedValueOnce(Error('Synthetic network'));
  await expect(service.submitManualOrder(email,order,false)).rejects.toThrow();
  const original=request.mock.calls[0][1].body,saved=JSON.parse(sessionStorage.getItem('lopokao-manual-request:'+email)!);
  expect(Object.keys(saved).sort()).toEqual(['fingerprint','id']);expect(JSON.stringify(saved)).not.toContain('Synthetic');
  expect(()=>service.beginAnotherManualOrder(email)).toThrow();
  await expect(service.submitManualOrder(email,{...order,totalAmount:200},false)).rejects.toThrow('勿變更');expect(request).toHaveBeenCalledTimes(1);
  request.mockImplementation(async(_path,options)=>Response.json({success:true,order_id:JSON.parse(options.body).order.requestId,sms_sent:false}));
  await service.retryManualOrder(email);expect(request.mock.calls[1][1].body).toBe(original);expect(service.hasManualPending(email)).toBe(false);
 });
 it('reconstructs the exact pending input from authenticated server status after reload',async()=>{
  let original;request.mockImplementation(async(_path,options)=>{original=JSON.parse(options.body);throw Error('Synthetic timeout');});
  const first=await import('../manualOrderService');await expect(first.submitManualOrder(email,order,false)).rejects.toThrow();vi.resetModules();
  request.mockResolvedValue(Response.json({success:true,data:original}));const fresh=await import('../manualOrderService');expect(await fresh.recoverManualDraft(email)).toEqual(original);
 });
 it('clears identity only on explicit safe server rejection and rejects wrong successful receipts',async()=>{
  const service=await import('../manualOrderService');request.mockResolvedValueOnce(Response.json({success:false,safe_to_restart:true,message:'Synthetic stale price'},{status:400}));
  await expect(service.submitManualOrder(email,order,false)).rejects.toThrow('Synthetic stale');expect(service.hasManualPending(email)).toBe(false);
  request.mockResolvedValueOnce(Response.json({success:true,order_id:crypto.randomUUID()}));await expect(service.submitManualOrder(email,order,false)).rejects.toThrow();expect(service.hasManualPending(email)).toBe(true);
 });
 it('permits an explicit next order with a new UUID even when the input is identical',async()=>{
  const service=await import('../manualOrderService');request.mockImplementation(async(_path,options)=>Response.json({success:true,order_id:JSON.parse(options.body).order.requestId}));
  const first=await service.submitManualOrder(email,order,false);expect((await service.submitManualOrder(email,order,false)).reused).toBe(true);expect(request).toHaveBeenCalledTimes(1);
  service.beginAnotherManualOrder(email);const next=await service.submitManualOrder(email,order,false);expect(next.order_id).not.toBe(first.order_id);expect(request).toHaveBeenCalledTimes(2);
 });
 it('does not replace corrupt saved identity or send an invalid quantity',async()=>{
  const service=await import('../manualOrderService');sessionStorage.setItem('lopokao-manual-request:'+email,'[]');await expect(service.submitManualOrder(email,order,false)).rejects.toThrow('識別');expect(request).not.toHaveBeenCalled();
  sessionStorage.clear();await expect(service.submitManualOrder(email,{...order,products:{fixture:1.5}},false)).rejects.toThrow('商品數量');expect(sessionStorage.length).toBe(0);expect(request).not.toHaveBeenCalled();
 });
});
