import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShoppingBag, 
  Users, 
  BarChart3, 
  Settings, 
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Home,
  Package,
  TrendingUp,
  Database,
  ShoppingCart
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDataSource, setDataSourceAndNotify, subscribeDataSourceChange } from '@/services/orderService';
import { useNavigate } from 'react-router-dom';

interface ModernSidebarProps {
  pageMode: 'orders' | 'customers';
  onPageModeChange: (mode: 'orders' | 'customers') => void;
  orderStats?: {
    total: number;
    pending: number;
    completed: number;
  };
  customerStats?: {
    total: number;
    active: number;
  };
  className?: string;
}

const ModernSidebar: React.FC<ModernSidebarProps> = ({
  pageMode,
  onPageModeChange,
  orderStats,
  customerStats,
  className
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [currentSource, setCurrentSource] = useState(getDataSource());
  const navigate = useNavigate();

  // 監聽資料來源變更
  React.useEffect(() => {
    const unsub = subscribeDataSourceChange(() => setCurrentSource(getDataSource()));
    return () => {
      if (unsub) unsub();
    };
  }, []);

  const menuItems = [
    {
      id: 'orders' as const,
      label: '訂單管理',
      icon: ShoppingBag,
      badge: orderStats?.total || 0,
      subBadge: orderStats?.pending || 0,
      description: '管理所有訂單',
      onClick: () => onPageModeChange('orders')
    },
    {
      id: 'customers' as const,
      label: '客戶資料',
      icon: Users,
      badge: customerStats?.total || 0,
      subBadge: customerStats?.active || 0,
      description: '管理客戶資訊',
      onClick: () => onPageModeChange('customers')
    },
    {
      id: 'products' as const,
      label: '商品管理',
      icon: Package,
      badge: 0,
      subBadge: 0,
      description: '管理商品資料',
      onClick: () => navigate('/products')
    }
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-screen">
      {/* 標題區域 */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h2 className="text-lg font-bold text-foreground">蘿蔔糕訂單系統</h2>
              <p className="text-xs text-muted-foreground">管理後台</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 hidden lg:flex"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 導航選單 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pageMode === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              className={cn(
                "w-full justify-start h-auto p-3 transition-all duration-200",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "hover:bg-accent hover:text-accent-foreground",
                isCollapsed && "justify-center px-2"
              )}
              onClick={() => {
                item.onClick();
                setIsMobileOpen(false);
              }}
            >
              <div className="flex items-center gap-3 w-full">
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-primary-foreground")} />
                
                {!isCollapsed && (
                  <div className="flex-1 text-left">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.label}</span>
                      {item.id !== 'products' && (
                        <div className="flex items-center gap-1">
                          {item.subBadge > 0 && (
                            <Badge 
                              variant={isActive ? "secondary" : "default"} 
                              className="h-5 px-2 text-xs"
                            >
                              {item.subBadge}
                            </Badge>
                          )}
                          <Badge 
                            variant={isActive ? "outline" : "secondary"} 
                            className="h-5 px-2 text-xs"
                          >
                            {item.badge}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <p className="text-xs opacity-70 mt-1">{item.description}</p>
                  </div>
                )}
              </div>
            </Button>
          );
        })}
        
        {/* 資料來源切換 */}
        {!isCollapsed && (
          <div className="pt-2 mt-2 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2 px-1">資料來源</div>
            <div className="flex gap-1">
              <Button
                variant={currentSource === 'sheets' ? "default" : "outline"}
                size="sm"
                className="flex-1 h-8"
                onClick={() => setDataSourceAndNotify('sheets')}
              >
                <Database className="h-3 w-3 mr-1" />
                Sheets
              </Button>
              <Button
                variant={currentSource === 'supabase' ? "default" : "outline"}
                size="sm"
                className="flex-1 h-8"
                onClick={() => setDataSourceAndNotify('supabase')}
              >
                <Database className="h-3 w-3 mr-1" />
                Supabase
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 底部資訊 */}
      {!isCollapsed && (
        <div className="p-3 border-t border-border/50">
          <Card className="bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <div>
                  <p className="font-medium">系統狀態</p>
                  <p className="text-xs text-muted-foreground">運行正常</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* 手機版選單按鈕 */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden fixed top-4 left-4 z-50"
        onClick={() => setIsMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* 桌面版側邊欄 */}
      <div className={cn(
        "hidden lg:flex flex-col bg-card border-r border-border/50 transition-all duration-300 h-screen",
        isCollapsed ? "w-16" : "w-64",
        className
      )}>
        <SidebarContent />
      </div>

      {/* 手機版側邊欄 */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div 
            className="absolute inset-0 bg-overlay-80" 
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-card border-r border-border/50">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h2 className="text-lg font-bold">選單</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
};

export default ModernSidebar;
