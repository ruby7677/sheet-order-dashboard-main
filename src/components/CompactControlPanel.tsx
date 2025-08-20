import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronUp,
  Filter,
  Printer,
  Download,
  BarChart3,
  Settings,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { getDataSource, setDataSourceAndNotify, subscribeDataSourceChange } from '@/services/orderService';

interface CompactControlPanelProps {
  // 統計資訊
  statsComponent: React.ReactNode;

  // 篩選器
  filtersComponent: React.ReactNode;

  // 操作按鈕
  actionButtons: React.ReactNode;

  // 統計數據
  totalItems: number;
  selectedCount: number;
  itemType: '訂單' | '客戶';

  // 控制狀態
  defaultExpanded?: boolean;

  // 重置篩選功能
  onResetFilters?: () => void;
}

const CompactControlPanel: React.FC<CompactControlPanelProps> = ({
  statsComponent,
  filtersComponent,
  actionButtons,
  totalItems,
  selectedCount,
  itemType,
  defaultExpanded = false,
  onResetFilters
}) => {
  const [isStatsExpanded, setIsStatsExpanded] = useState(defaultExpanded);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [currentSource, setCurrentSource] = useState(getDataSource());

  // 監聽資料來源變更，觸發 UI 更新
  React.useEffect(() => {
    const unsub = subscribeDataSourceChange(() => setCurrentSource(getDataSource()));
    return () => {
      if (typeof unsub === 'function') {
        unsub();
      }
    };
  }, []);

  return (
    <div className="space-y-2 mb-4">
      {/* 主控制欄 - 更緊湊的設計 */}
      <Card className="border border-border/[0.5] shadow-sm">
        <CardContent className="p-2">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">

            {/* 左側：控制按鈕和統計資訊 */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {/* 控制按鈕組 */}
              <div className="flex items-center gap-1">
                {/* 統計卡片摺疊按鈕 */}
                <Collapsible open={isStatsExpanded} onOpenChange={setIsStatsExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 text-xs transition-all duration-200",
                        isStatsExpanded
                          ? "bg-blue-100 text-blue-700 border border-blue-200"
                          : "text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200"
                      )}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      統計
                      {isStatsExpanded ?
                        <EyeOff className="h-3 w-3 ml-1" /> :
                        <Eye className="h-3 w-3 ml-1" />
                      }
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>

                {/* 篩選器摺疊按鈕 */}
                <Collapsible open={isFiltersExpanded} onOpenChange={setIsFiltersExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 px-2 text-xs transition-all duration-200",
                        isFiltersExpanded
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "text-purple-600 hover:bg-purple-50 border border-transparent hover:border-purple-200"
                      )}
                    >
                      <Filter className="h-3 w-3 mr-1" />
                      篩選
                      {isFiltersExpanded ?
                        <EyeOff className="h-3 w-3 ml-1" /> :
                        <Eye className="h-3 w-3 ml-1" />
                      }
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>

              {/* 統計數字 - 更緊湊的設計 */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">篩選結果:</span>
                  <Badge variant="secondary" className="h-5 px-2 text-xs font-medium">
                    {totalItems} 筆{itemType}
                  </Badge>
                </div>
                {selectedCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">已選擇:</span>
                    <Badge variant="destructive" className="h-5 px-2 text-xs font-medium animate-pulse">
                      {selectedCount} 筆
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* 右側：操作按鈕 - 更緊湊的佈局 */}
            <div className="flex flex-wrap gap-1 items-center">
              {/* 資料來源切換：Sheets / Supabase */}
              <div className="flex items-center gap-1 text-xs border rounded px-2 py-1 mr-1">
                <span className="text-muted-foreground">來源</span>
                <Button
                  variant={currentSource === 'sheets' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setDataSourceAndNotify('sheets')}
                >
                  Sheets
                </Button>
                <Button
                  variant={currentSource === 'supabase' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setDataSourceAndNotify('supabase')}
                >
                  Supabase
                </Button>
              </div>
              {actionButtons}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 統計卡片摺疊區域 - 優化設計 */}
      <Collapsible open={isStatsExpanded} onOpenChange={setIsStatsExpanded}>
        <CollapsibleContent className="space-y-1">
          <Card className="border-blue-200/[0.6] bg-gradient-to-r from-blue-50/[0.5] to-blue-100/[0.3] shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-blue-700 flex items-center gap-1">
                  <BarChart3 className="h-4 w-4" />
                  統計資訊
                </h3>
              </div>
              {statsComponent}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* 篩選器摺疊區域 - 優化設計 */}
      <Collapsible open={isFiltersExpanded} onOpenChange={setIsFiltersExpanded}>
        <CollapsibleContent className="space-y-1">
          <Card className="border-purple-200/[0.6] bg-gradient-to-r from-purple-50/[0.5] to-purple-100/[0.3] shadow-sm">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-purple-700 flex items-center gap-1">
                  <Filter className="h-4 w-4" />
                  篩選條件
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-purple-600 hover:bg-purple-100 transition-colors"
                  onClick={onResetFilters}
                  disabled={!onResetFilters}
                >
                  <Settings className="h-3 w-3 mr-1" />
                  重置
                </Button>
              </div>
              {filtersComponent}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default CompactControlPanel;
