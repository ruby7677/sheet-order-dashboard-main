import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import AdminLoginPage from '../pages/AdminLoginPage';
import AdminDashboardPage from '../pages/AdminDashboardPage';

const isAuthenticated = () => {
  return !!localStorage.getItem('admin_token');
};

const AdminRoutes = [
  {
    path: '/admin',
    element: isAuthenticated() ? <Navigate to="/admin/dashboard" /> : <AdminLoginPage />,
  },
  {
    path: '/admin/dashboard',
    element: isAuthenticated() ? <AdminDashboardPage /> : <Navigate to="/admin" />,
  },
];

export default AdminRoutes;
