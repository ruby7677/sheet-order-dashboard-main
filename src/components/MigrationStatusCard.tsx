import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Database, RefreshCw } from 'lucide-react';

interface MigrationStatusCardProps {
  isActive: boolean;
  lastSync?: Date;
  totalRecords?: {
    orders: number;
    customers: number;
    products: number;
  };
}

/**
 * 遷移狀態顯示卡片，用於側邊欄或儀表板顯示
 */
export const MigrationStatusCard: React.FC<MigrationStatusCardProps> = ({
  isActive,
  lastSync,
  totalRecords
}) => {
  const formatLastSync = (date?: Date) => {
    if (!date) return '未同步';
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return '剛剛同步';
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} 小時前`;
    return `${Math.floor(diffInMinutes / 1440)} 天前`;
  };

  return (
    <Card className="bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-200/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Database className="h-4 w-4 text-blue-600" />
          資料同步狀態
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">同步狀態</span>
          <div className="flex items-center gap-1">
            {isActive ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                <Badge variant="default" className="text-xs">同步中</Badge>
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3 text-green-600" />
                <Badge variant="secondary" className="text-xs">已完成</Badge>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">最後同步</span>
          <span className="text-xs font-medium">{formatLastSync(lastSync)}</span>
        </div>

        {totalRecords && (
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
            <div className="text-center">
              <div className="text-sm font-bold text-green-600">{totalRecords.orders}</div>
              <div className="text-xs text-muted-foreground">訂單</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-blue-600">{totalRecords.customers}</div>
              <div className="text-xs text-muted-foreground">客戶</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-purple-600">{totalRecords.products}</div>
              <div className="text-xs text-muted-foreground">商品</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MigrationStatusCard;