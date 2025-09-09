// Linus式 Index.tsx - 只做路由，不处理业务逻辑
import React, { useState, useEffect } from 'react';
import ModernSidebar from '@/components/ModernSidebar';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import MainContent from '@/components/MainContent';
import { PageMode } from '@/types/page';
import { fetchOrders } from '@/services/orderService';
import { fetchCustomers, getCustomerStats } from '@/services/customerService';

const Index: React.FC = () => {
  // Linus式简化：只保留路由状态和统计数据
  const [isInIframe, setIsInIframe] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>('orders');
  
  // 只保留侧边栏需要的统计数据
  const [orderStats, setOrderStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
  });
  
  const [customerStats, setCustomerStats] = useState({
    total: 0,
    active: 0,
  });

  // iframe 检测
  useEffect(() => {
    setIsInIframe(window.self !== window.top);
  }, []);

  // PostMessage 通信（iframe模式）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin && !isInIframe) return;
      
      if (event.data?.type === 'changeMode' && event.data.mode) {
        const validModes: PageMode[] = ['orders', 'customers', 'delivery-settings', 'products'];
        if (validModes.includes(event.data.mode)) {
          setPageMode(event.data.mode);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isInIframe]);

  // 加载统计数据
  useEffect(() => {
    const loadStats = async () => {
      try {
        // 并行加载统计数据
        const [orders, customers] = await Promise.all([
          fetchOrders(),
          fetchCustomers()
        ]);

        // 计算订单统计
        const pendingOrders = orders.filter(o => o.status === '訂單確認中' || o.status === '已抄單').length;
        const completedOrders = orders.filter(o => o.status === '已出貨').length;
        
        setOrderStats({
          total: orders.length,
          pending: pendingOrders,
          completed: completedOrders,
        });

        // 计算客户统计
        const customerStatsData = getCustomerStats(customers);
        setCustomerStats({
          total: customerStatsData.totalCustomers,
          active: customerStatsData.activeCustomers,
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    };

    loadStats();
  }, []);

  return (
    <div className={`min-h-dvh bg-background text-foreground ${isInIframe ? 'iframe-mode' : ''}`}>
      <div className="flex h-dvh">
        <ModernSidebar
          pageMode={pageMode}
          onPageModeChange={setPageMode}
          orderStats={orderStats}
          customerStats={customerStats}
        />
        
        <MainContent mode={pageMode} />
        
        {!isInIframe && <ScrollToTopButton />}
      </div>
    </div>
  );
};

export default Index;