import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAdminSession, adminReturnPath } from '../adminSession';
import { adminFetch, ADMIN_AUTH_FAILURE } from '../adminApi';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const user={id:'synthetic',username:'admin',email:'admin@example.invalid',full_name:'Synthetic',role:'admin'};
describe('admin session recovery',()=>{
 it.each([[401,'expired'],[403,'forbidden'],[429,'unavailable'],[503,'unavailable']])('classifies HTTP %s',async(status,kind)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:status as number})));
  expect((await checkAdminSession()).kind).toBe(kind);
 });
 it('rejects HTML SPA fallback and malformed user instead of treating them as expired login',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}})).mockResolvedValueOnce(Response.json({success:true,logged_in:true,user:{email:'x'}}));
  vi.stubGlobal('fetch',fetcher);
  expect(await checkAdminSession()).toEqual({kind:'unavailable',code:'AUTH_RESPONSE_INVALID'});
  expect(await checkAdminSession()).toEqual({kind:'unavailable',code:'AUTH_RESPONSE_INVALID'});
 });
 it('accepts server identity, sends no legacy authorization and uses same-origin cookies',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({success:true,logged_in:true,user}));vi.stubGlobal('fetch',fetcher);
  expect(await checkAdminSession()).toEqual({kind:'authenticated',user});
  expect(fetcher.mock.calls[0][0]).toBe('/api/auth/me');
  expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'same-origin',cache:'no-store',redirect:'manual'});
 });
 it('classifies an Access redirect as expired',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({type:'opaqueredirect',status:0}));
  expect((await checkAdminSession()).kind).toBe('expired');
 });
 it('bounds an unanswered request at twelve seconds',async()=>{
  vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))));
  const pending=checkAdminSession();await vi.advanceTimersByTimeAsync(12000);
  expect(await pending).toEqual({kind:'unavailable',code:'AUTH_TIMEOUT'});
 });
 it('keeps business 403 readable and does not sign out, but announces revoked admin',async()=>{
  const handler=vi.fn();window.addEventListener(ADMIN_AUTH_FAILURE,handler);
  try {
   vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(Response.json({code:'DELETE_NOT_ALLOWED'},{status:403})).mockResolvedValueOnce(Response.json({code:'ADMIN_NOT_ALLOWED'},{status:403})));
   const response=await adminFetch('/orders');expect(await response.json()).toEqual({code:'DELETE_NOT_ALLOWED'});expect(handler).not.toHaveBeenCalled();
   await adminFetch('/orders');expect(handler).toHaveBeenCalledOnce();
  } finally {window.removeEventListener(ADMIN_AUTH_FAILURE,handler);}
 });
 it('limits return destinations to admin routes',()=>{
  expect(adminReturnPath('/manual-orders')).toBe('/manual-orders');
  for(const path of ['https://evil.invalid','//evil.invalid','/admin','/cdn-cgi/access/logout'])expect(adminReturnPath(path)).toBe('/');
 });
});
