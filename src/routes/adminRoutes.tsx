import React from 'react';
import { Navigate } from 'react-router-dom';
import AdminLoginPage from '../pages/AdminLoginPage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import { useAuth } from '../hooks/useAuth';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">載入中...</div>;
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/admin" />;
};

const AdminRoutes = [
  {
    path: '/admin',
    element: <AdminLoginPage />,
  },
  {
    path: '/admin/dashboard',
    element: (
      <ProtectedRoute>
        <AdminDashboardPage />
      </ProtectedRoute>
    ),
  },
];

export default AdminRoutes;
