import { useAuth } from '@/components/AuthProvider';
import { Navigate, useLocation } from 'react-router-dom';
import { adminReturnPath } from '@/services/adminSession';
import { Button } from '@/components/ui/button';

export default function AdminLoginPage() {
 const {isAuthenticated,isLoading,authIssue,retryAuth,logout}=useAuth();
 const location=useLocation(), returnPath=adminReturnPath(location.state?.from?.pathname);
 if(isAuthenticated)return <Navigate to={returnPath} replace/>;
 const kind=authIssue?.kind;
 const title=isLoading?'正在驗證管理員身分':kind==='unavailable'?'暫時無法驗證登入':kind==='forbidden'?'此帳號沒有後台權限':'請重新登入後台';
 const message=isLoading?'請稍候，正在確認 Cloudflare Access 與後台權限。':kind==='unavailable'?'登入驗證服務暫時無法回應。請重試；不需要先登出。':kind==='forbidden'?'請使用已授權的管理員電子郵件登入。若已使用正確帳號，請聯絡管理員確認權限。':'登入工作階段可能已過期。請重新開啟登入驗證；若仍無法進入，可先登出再登入。';
 return <main className="min-h-screen flex items-center justify-center bg-gray-100 px-4 py-8">
  <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-sm sm:p-8" aria-labelledby="login-title" aria-busy={isLoading}>
   <h1 id="login-title" className="text-2xl font-bold text-gray-900">{title}</h1>
   <p role="status" aria-live="polite" className="mt-4 text-base leading-relaxed text-gray-700">{message}</p>
   {!isLoading&&<div className="mt-6 flex flex-col gap-3">
    <Button onClick={()=>kind==='expired'?window.location.assign(returnPath):void retryAuth()}>{kind==='expired'?'重新登入':'重試驗證'}</Button>
    <Button variant="outline" onClick={logout}>登出／切換帳號</Button>
    <p className="text-sm leading-relaxed text-gray-600">切換帳號會開啟 Cloudflare 登出頁。完成後，重新開啟後台並以管理員郵件登入；Cloudflare 登出也會結束其他 Access 應用的工作階段。</p>
    {authIssue&&<p className="text-xs text-gray-600">診斷代碼：{authIssue.code}</p>}
   </div>}
  </section>
 </main>;
}
