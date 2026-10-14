import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { ADMIN_AUTH_FAILURE } from '@/services/adminApi';
import { checkAdminSession, type AdminSession, type AdminUser } from '@/services/adminSession';
interface AuthContextType { user:AdminUser|null; token:null; login:(username?:string,password?:string)=>Promise<{success:boolean;message?:string}>; logout:()=>void; isAuthenticated:boolean; isLoading:boolean; authIssue:{kind:'expired'|'forbidden'|'unavailable';code:string}|null; retryAuth:()=>Promise<void> }
const AuthContext=createContext<AuthContextType|undefined>(undefined);
export const useAuth=()=>{const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required');return value;};
export function AuthProvider({children}:{children:ReactNode}) {
 const [session,setSession]=useState<AdminSession|null>(null);
 const pending=useRef<AbortController|null>(null), generation=useRef(0);
 const retryAuth=useCallback(async()=>{const current=++generation.current;pending.current?.abort();const controller=new AbortController();pending.current=controller;setSession(null);const result=await checkAdminSession(controller.signal);if(generation.current===current&&!controller.signal.aborted)setSession(result);},[]);
 useEffect(()=>{
  for(const key of ['admin_token','admin_user','secure_admin_token','secure_admin_user','data_source','sb-skcdapfynyszxyqqsvib-auth-token']) { try { localStorage.removeItem(key); } catch { /* Storage restrictions must not block server authentication. */ } }
  const onFailure=(event:Event)=>{const kind=(event as CustomEvent).detail==='forbidden'?'forbidden':'expired';++generation.current;pending.current?.abort();setSession({kind,code:kind==='forbidden'?'ADMIN_NOT_ALLOWED':'ACCESS_LOGIN_REQUIRED'});};
  window.addEventListener(ADMIN_AUTH_FAILURE,onFailure);void retryAuth();
  return()=>{++generation.current;pending.current?.abort();window.removeEventListener(ADMIN_AUTH_FAILURE,onFailure);};
 },[retryAuth]);
 const user=session?.kind==='authenticated'?session.user:null;
 const value=useMemo<AuthContextType>(()=>({user,token:null,isLoading:session===null,isAuthenticated:!!user,authIssue:session&&session.kind!=='authenticated'?session:null,retryAuth,
  login:async()=>{window.location.assign('/');return {success:false,message:'請使用 Cloudflare Access 管理員登入。'};},
  logout:()=>{++generation.current;pending.current?.abort();setSession({kind:'expired',code:'ACCESS_LOGIN_REQUIRED'});window.location.assign('/cdn-cgi/access/logout');}
 }),[user,session,retryAuth]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
