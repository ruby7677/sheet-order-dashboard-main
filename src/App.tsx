import ProductManagementPage from './pages/ProductManagementPage';
import DeliveryDateSettingsPage from './pages/DeliveryDateSettingsPage';
import React from 'react';
import AdminRoutes from './routes/adminRoutes';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();
const isStaging = import.meta.env.VITE_ENVIRONMENT === 'staging';

// 創建受保護的路由組件
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">載入中...</div>;
  }
  
  return isAuthenticated ? <>{children}</> : (
    <Navigate to="/admin" replace state={{ from: location }} />
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          {isStaging && (
            <aside
              role="status"
              className="w-full border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs leading-relaxed text-amber-950 sm:text-sm"
            >
              測試環境｜僅使用隔離測試資料；下單通知均為模擬。請勿輸入真實客戶或訂單資料。
            </aside>
          )}
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/manual-orders" element={<ProtectedRoute><Index initialMode="manual" /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute><ProductManagementPage /></ProtectedRoute>} />
              <Route path="/delivery-settings" element={<ProtectedRoute><DeliveryDateSettingsPage /></ProtectedRoute>} />
              {AdminRoutes.map((route, idx) => (
                <Route key={idx} path={route.path} element={route.element} />
              ))}
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
