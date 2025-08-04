import React from 'react';
import { cn } from '@/lib/utils';

// 狀態徽章元件的屬性型別，僅允許四種中文狀態
interface StatusBadgeProps {
  /**
   * 訂單狀態，『訂單確認中』『已抄單』『已出貨』『取消訂單』四種
   */
  status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單';
  /**
   * 額外的 className，可選
   */
  className?: string;
}

// 狀態徽章元件，根據訂單狀態顯示不同顏色與文字
// status: 『訂單確認中』『已抄單』『已出貨』『取消訂單』
const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  // 狀態對應的顏色 class，可依實際設計調整
  const badgeClass: Record<'訂單確認中' | '已抄單' | '已出貨' | '取消訂單', string> = {
    '訂單確認中': 'status-processing', // 例：藍色
    '已抄單': 'status-processing', // 例：藍色
    '已出貨': 'status-completed',  // 例：綠色
    '取消訂單': 'status-canceled'  // 例：紅色
  };

  return (
    // 顯示中文狀態，並套用對應顏色
    <span className={cn('status-badge', badgeClass[status], className)}>
      {status}
    </span>
  );
};

export default StatusBadge;
