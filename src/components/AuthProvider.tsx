import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { adminFetch } from '@/services/adminApi';
interface User { id:string; username:string; email:string; full_name:string; role:string }
interface AuthContextType { user:User|null; token:null; login:(username?:string,password?:string)=>Promise<{success:boolean;message?:string}>; logout:()=>void; isAuthenticated:boolean; isLoading:boolean }
const AuthContext=createContext<AuthContextType|undefined>(undefined);
export const useAuth=()=>{const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required');return value;};
export function AuthProvider({children}:{children:ReactNode}) {
 const [user,setUser]=useState<User|null>(null); const [isLoading,setIsLoading]=useState(true);
 useEffect(()=>{let active=true; for(const key of ['admin_token','admin_user','secure_admin_token','secure_admin_user','data_source','sb-skcdapfynyszxyqqsvib-auth-token'])localStorage.removeItem(key);
  adminFetch('/auth/me').then(async r=>{if(!r.ok)return null;const result=await r.json();return result.success&&result.logged_in?result.user:null;}).then(value=>{if(active)setUser(value);}).catch(()=>{if(active)setUser(null);}).finally(()=>{if(active)setIsLoading(false);});return ()=>{active=false;};},[]);
 const value=useMemo<AuthContextType>(()=>({user,token:null,isLoading,isAuthenticated:!!user,
  login:async()=>{window.location.assign('/');return {success:false,message:'請使用 Cloudflare Access 管理員登入。'};},
  logout:()=>{setUser(null);window.location.assign('/cdn-cgi/access/logout');}
 }),[user,isLoading]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
