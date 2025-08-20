import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import AdminLoginPage from '../pages/AdminLoginPage';
import AdminDashboardPage from '../pages/AdminDashboardPage';
import { useAuth } from '../components/AuthProvider';

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
