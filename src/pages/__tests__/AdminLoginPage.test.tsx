import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/components/AuthProvider';
import AdminLoginPage from '../AdminLoginPage';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const user={id:'synthetic',username:'admin',email:'admin@example.invalid',full_name:'Synthetic',role:'admin'};
function OriginalRoute(){const {isAuthenticated,authIssue}=useAuth();return <p>{isAuthenticated?'Original manual route':authIssue?.kind}</p>;}
function renderLogin(){return render(<MemoryRouter initialEntries={[{pathname:'/admin',state:{from:{pathname:'/manual-orders'}}}]}><AuthProvider><Routes><Route path="/admin" element={<AdminLoginPage/>}/><Route path="/manual-orders" element={<OriginalRoute/>}/></Routes></AuthProvider></MemoryRouter>);}
describe('login screen recovery',()=>{
 it('recovers a service failure with retry, without logging out, and returns to original route',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(Response.json({success:true,logged_in:true,user}));vi.stubGlobal('fetch',fetcher);
  renderLogin();await screen.findByText('暫時無法驗證登入');fireEvent.click(screen.getByRole('button',{name:'重試驗證'}));
  await screen.findByText('Original manual route');expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('still authenticates if localStorage is blocked',async()=>{
  vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw Error('blocked');});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,logged_in:true,user})));
  renderLogin();await screen.findByText('Original manual route');
 });
 it('shows a permission issue and account switching separately',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  renderLogin();await screen.findByText('此帳號沒有後台權限');expect(screen.getByRole('button',{name:'登出／切換帳號'})).toBeTruthy();
 });
 it('clears an existing identity after an API session-expired event',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:true,logged_in:true,user})));
  renderLogin();await screen.findByText('Original manual route');
  window.dispatchEvent(new CustomEvent('admin-auth-failure',{detail:'expired'}));
  await screen.findByText('expired');expect(screen.queryByText('Original manual route')).toBeNull();
 });
});
