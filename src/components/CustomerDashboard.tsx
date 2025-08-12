import React, { useState, useEffect } from 'react';
import StatCard from './StatCard';
import { fetchCustomers, getCustomerStats, clearCustomerCache } from '../services/customerService';
import { CustomerStats } from '../types/customer';

interface CustomerDashboardProps {
  refreshTrigger?: number; // 用於觸發重新載入的計數器
  compact?: boolean; // 緊湊模式，不顯示外層容器
}

const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ refreshTrigger = 0, compact = false }) => {
  const [stats, setStats] = useState<CustomerStats>({
    total: 0,
    regions: {},
    purchaseCounts: {
      '1': 0,
      '2-5': 0,
      '5+': 0
    }
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [topRegions, setTopRegions] = useState<{name: string, count: number}[]>([]);

  // 載入統計數據
  const loadStats = async (immediate = false) => {
    setLoading(true);

    // 如果需要立即更新，則不延遲
    if (!immediate) {
      // 添加短暫延遲，避免過於頻繁的 API 請求
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    try {
      // 清除快取，確保獲取最新數據
      clearCustomerCache();
      const customers = await fetchCustomers();
      const customerStats = getCustomerStats(customers);
      setStats(customerStats);

      // 計算前三大地區
      const sortedRegions = Object.entries(customerStats.regions)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      setTopRegions(sortedRegions);
    } catch (error) {
      console.error('載入統計數據失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初次載入和 refreshTrigger 變化時重新載入數據
  useEffect(() => {
    loadStats(refreshTrigger > 0);
  }, [refreshTrigger]);

  // 統計卡片網格
  const statsGrid = (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
      <StatCard
        title="總客戶數"
        value={loading ? '...' : stats.total}
        compact={true}
        className="bg-card"
      />
      <StatCard
        title="購買 1 次"
        value={loading ? '...' : stats.purchaseCounts['1']}
        compact={true}
        className="bg-blue-50 dark:bg-blue-900/30 border-blue-500"
      />
      <StatCard
        title="購買 2-5 次"
        value={loading ? '...' : stats.purchaseCounts['2-5']}
        compact={true}
        className="bg-orange-50 dark:bg-orange-900/30 border-orange-500"
      />
      <StatCard
        title="購買 5 次以上"
        value={loading ? '...' : stats.purchaseCounts['5+']}
        compact={true}
        className="bg-green-50 dark:bg-green-900/30 border-green-500"
      />
      <StatCard
        title={`主要地區: ${topRegions[0]?.name || '無資料'}`}
        value={loading ? '...' : topRegions[0]?.count || 0}
        compact={true}
        className="bg-purple-50 dark:bg-purple-900/30 border-purple-500"
      />
    </div>
  );

  // 緊湊模式只返回統計卡片
  if (compact) {
    return statsGrid;
  }

  // 完整模式包含外層容器
  return (
    <div className="mb-4">
      {statsGrid}
    </div>
  );
};

export default CustomerDashboard;
