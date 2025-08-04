
import React, { useState, useEffect } from 'react';
import StatCard from './StatCard';
import { fetchOrderStats, clearOrderCache } from '@/services/orderService';
import { OrderStats } from '@/types/order';

interface DashboardProps {
  refreshTrigger?: number; // 用於觸發重新載入的計數器
  compact?: boolean; // 緊湊模式，不顯示外層容器
}

const Dashboard: React.FC<DashboardProps> = ({ refreshTrigger = 0, compact = false }) => {
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    canceled: 0,
    unpaid: 0,
    totalAmount: 0,
    totalRadishCake: 0,
    totalTaroCake: 0,
    totalHKRadishCake: 0,
    totaltest: 0
  });

  const [loading, setLoading] = useState<boolean>(true);

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
      clearOrderCache();
      const data = await fetchOrderStats();
      setStats(data);
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

  // 格式化金額顯示
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('zh-TW', {
      style: 'currency',
      currency: 'TWD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // 統計卡片網格 - 響應式設計：手機3欄，平板5欄，桌面7欄
  const statsGrid = (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 sm:gap-3">
      <StatCard
        title="總訂單數"
        value={loading ? '...' : stats.total}
        compact={true}
        className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-slate-200 dark:border-slate-700"
      />
      <StatCard
        title="訂單確認中"
        value={loading ? '...' : stats.pending}
        compact={true}
        className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-blue-200 dark:border-blue-700"
      />
      <StatCard
        title="已抄單"
        value={loading ? '...' : stats.processing}
        compact={true}
        className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 border-orange-200 dark:border-orange-700"
      />
      <StatCard
        title="已出貨"
        value={loading ? '...' : stats.completed}
        compact={true}
        className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-700"
      />
      <StatCard
        title="取消訂單"
        value={loading ? '...' : stats.canceled}
        compact={true}
        className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 border-red-200 dark:border-red-700"
      />
      <StatCard
        title="未收費"
        value={loading ? '...' : stats.unpaid}
        compact={true}
        className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/30 dark:to-yellow-800/30 border-yellow-200 dark:border-yellow-700"
      />
      <StatCard
        title="總金額"
        value={loading ? '...' : formatAmount(stats.totalAmount)}
        compact={true}
        className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 border-purple-200 dark:border-purple-700"
      />
      <StatCard
        title="原味蘿蔔糕"
        value={loading ? '...' : stats.totalRadishCake}
        compact={true}
        className="bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900/30 dark:to-stone-800/30 border-stone-200 dark:border-stone-700"
      />
      <StatCard
        title="芋頭粿"
        value={loading ? '...' : stats.totalTaroCake}
        compact={true}
        className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-900/30 dark:to-violet-800/30 border-violet-200 dark:border-violet-700"
      />
      <StatCard
        title="台式鹹蘿蔔糕"
        value={loading ? '...' : stats.totalHKRadishCake}
        compact={true}
        className="bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900/30 dark:to-neutral-800/30 border-neutral-200 dark:border-neutral-700"
      />
      <StatCard
        title="鳳梨豆腐乳"
        value={loading ? '...' : stats.totaltest}
        compact={true}
        className="bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-900/30 dark:to-neutral-800/30 border-neutral-200 dark:border-neutral-700"
      />
    </div>
  );

  // 緊湊模式只返回統計卡片
  if (compact) {
    return statsGrid;
  }

  // 完整模式包含標題和統計卡片
  return (
    <div className="mb-6">
      {/* 統計卡片標題 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-foreground">訂單統計</h2>
        {loading && (
          <div className="text-sm text-muted-foreground">更新中...</div>
        )}
      </div>

      {statsGrid}
    </div>
  );
};

export default Dashboard;
