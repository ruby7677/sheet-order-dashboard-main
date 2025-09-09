// Linus式主内容路由 - 单一职责，没有业务逻辑
import React from 'react';
import { PageMode } from '@/types/page';
import OrdersPage from '@/pages/OrdersPage';
import CustomersPage from '@/pages/CustomersPage';
import ProductManagementPage from '@/pages/ProductManagementPage';
import DeliveryDateSettingsPage from '@/pages/DeliveryDateSettingsPage';

interface MainContentProps {
  mode: PageMode;
}

const MainContent: React.FC<MainContentProps> = ({ mode }) => {
  // 简单的路由逻辑，没有条件分支嵌套
  const pages = {
    orders: OrdersPage,
    customers: CustomersPage,
    products: ProductManagementPage,
    'delivery-settings': DeliveryDateSettingsPage,
  };

  const Page = pages[mode];
  return <Page />;
};

export default MainContent;