import { useAuth } from '@/components/AuthProvider';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ShoppingBag, 
  Users, 
  Menu,
  ChevronLeft,
  ChevronRight,
  Package,
  Calendar,
  FileText,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useScrollAwareMenu from '@/hooks/useScrollAwareMenu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface ModernSidebarProps {
  pageMode: 'orders' | 'customers' | 'products' | 'delivery-settings' | 'operations';
  onPageModeChange: (mode: 'orders' | 'customers' | 'products' | 'delivery-settings' | 'operations') => void;
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
  const { user, logout } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isContentScrolled, setIsContentScrolled] = useState(false);
  
  // 滾動感知邏輯
  const scrollState = useScrollAwareMenu({
    hideThreshold: 80,
    showThreshold: 40,
    hideDelay: 200,
    hideAtTop: false, // 在頂部也顯示按鈕
    minScrollDistance: 5
  });

  // 監聽主內容區域的滾動狀態
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 20;
      setIsContentScrolled(scrolled);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // 初始檢查
    
    return () => window.removeEventListener('scroll', handleScroll);
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
    {id:'operations' as const,label:'待辦對帳',icon:FileText,badge:0,subBadge:0,description:'待確認操作與紀錄',onClick:()=>onPageModeChange('operations')},
    {id:'products' as const,label:'商品設定',icon:Package,badge:0,subBadge:0,description:'商品資料與庫存',onClick:()=>onPageModeChange('products')},
    {id:'delivery-settings' as const,label:'到貨日期設定',icon:Calendar,badge:0,subBadge:0,description:'前台可選到貨日期',onClick:()=>onPageModeChange('delivery-settings')},
  ];

  const SidebarContent = () => {
    const showFullContent = !isCollapsed || isMobileOpen;
    const isCompact = isCollapsed && !isMobileOpen;

    return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" role="navigation" aria-label="主選單">
      {/* 標題區域 */}
      <div className="shrink-0 p-4 border-b border-border/50">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {showFullContent && (
            <div className="min-w-0 flex-1">
              <h2 className="whitespace-normal break-words text-lg font-bold text-foreground">蘿蔔糕訂單系統</h2>
              <p className="text-xs text-muted-foreground">管理後台</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 shrink-0 hidden lg:flex"
            aria-label={isCollapsed ? '展開側邊欄' : '收合側邊欄'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 導航選單 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pageMode === item.id;
          
          return (
            <Button
              key={item.id}
              variant={isActive ? "default" : "ghost"}
              aria-label={isCompact ? item.label : undefined}
              title={isCompact ? item.label : undefined}
              className={cn(
                "w-full min-w-0 whitespace-normal justify-start h-auto p-3 transition-all duration-200",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "hover:bg-accent hover:text-accent-foreground",
                isCompact && "justify-center px-2"
              )}
              onClick={() => {
                item.onClick();
                setIsMobileOpen(false);
              }}
            >
              <div className="flex w-full min-w-0 items-start gap-3">
                <Icon className={cn("h-5 w-5 flex-shrink-0", isActive && "text-primary-foreground")} />
                
                {showFullContent && (
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 whitespace-normal break-words font-medium">{item.label}</span>
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        {item.subBadge > 0 && (
                          <Badge
                            variant={isActive ? "secondary" : "default"}
                            className="h-5 min-w-5 shrink-0 px-1.5 text-xs tabular-nums"
                          >
                            {item.subBadge}
                          </Badge>
                        )}
                        <Badge
                          variant={isActive ? "outline" : "secondary"}
                          className="h-5 min-w-5 shrink-0 px-1.5 text-xs tabular-nums"
                        >
                          {item.badge}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-1 whitespace-normal break-words text-xs opacity-70">{item.description}</p>
                  </div>
                )}
              </div>
            </Button>
          );
        })}

        {/* 手抄單連結按鈕 */}
        {showFullContent && (
          <div className="pt-2 mt-2 border-t border-border/50">
            <Button
              variant="ghost"
              className="w-full min-w-0 whitespace-normal justify-start h-auto p-3 transition-all duration-200 hover:bg-accent hover:text-accent-foreground"
              onClick={() => window.open('https://767780.xyz/pos8-test.php', '_blank', 'width=800,height=900,scrollbars=yes,resizable=yes')}
            >
              <div className="flex w-full min-w-0 items-start gap-3">
                <FileText className="h-5 w-5 flex-shrink-0" />
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center justify-between">
                    <span className="whitespace-normal break-words font-medium">手抄單</span>
                  </div>
                  <p className="mt-1 whitespace-normal break-words text-xs opacity-70">開啟手抄單頁面</p>
                </div>
              </div>
            </Button>
          </div>
        )}
      </div>

      <div className="shrink-0 p-3 border-t border-border/50">
        {showFullContent && <p className="text-xs text-muted-foreground truncate mb-2" title={user?.email}>{user?.email}</p>}
        <Button type="button" variant="outline" className="w-full" onClick={logout} aria-label="登出管理後台" title="登出管理後台">
          <LogOut className="h-4 w-4" />
          {showFullContent && <span className="ml-2">登出</span>}
        </Button>
      </div>

    </div>
    );
  };

  return (
    <>
      {/* 手機版選單按鈕 - 智能顯示/隱藏 */}
      <Button
        variant={isContentScrolled ? "default" : "ghost"}
        size="icon"
        className={cn(
          "lg:hidden fixed transition-all duration-300 ease-in-out z-40",
          "w-12 h-12 rounded-full shadow-lg backdrop-blur-sm",
          // 動態位置：根據滾動狀態調整
          scrollState.isVisible 
            ? "top-4 left-4 translate-y-0 opacity-100" 
            : "-top-16 left-4 -translate-y-2 opacity-0",
          // 背景樣式：根據內容滾動狀態調整
          isContentScrolled 
            ? "bg-primary/90 hover:bg-primary border border-primary/20" 
            : "bg-background/80 hover:bg-accent border border-border/50",
          // 確保不會遮擋內容
          "hover:scale-105 active:scale-95"
        )}
        onClick={() => setIsMobileOpen(true)}
        aria-label="開啟選單"
        aria-expanded={isMobileOpen}
        aria-controls="mobile-sidebar"
        style={{
          // 使用 transform 而非 top 來優化性能
          transform: scrollState.isVisible 
            ? 'translateY(0) scale(1)' 
            : 'translateY(-100%) scale(0.9)'
        }}
      >
        <Menu className={cn(
          "h-5 w-5 transition-colors duration-200",
          isContentScrolled ? "text-primary-foreground" : "text-foreground"
        )} />
      </Button>

      {/* 桌面版側邊欄 */}
      <div className={cn(
        "hidden lg:sticky lg:top-0 lg:h-[100dvh] lg:flex flex-col bg-card border-r border-border/50 transition-all duration-300",
        isCollapsed ? "w-16" : "w-64",
        className
      )}>
        <nav aria-label="主選單" className="min-h-0 flex-1"><SidebarContent /></nav>
      </div>

      {/* 手機版側邊欄：使用 Sheet 以獲得焦點鎖定與 ESC 關閉 */}
      <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
        <SheetContent side="left" className="flex min-h-0 w-64 flex-col bg-card border-r border-border/50 p-0" id="mobile-sidebar">
          <div className="shrink-0 flex min-w-0 items-center justify-between gap-2 p-4 border-b border-border/50">
            <SheetTitle className="min-w-0 flex-1 whitespace-normal break-words text-lg font-bold">選單</SheetTitle>
            <SheetDescription className="sr-only">選擇管理頁面或登出</SheetDescription>
          </div>
          <nav aria-label="主選單" className="min-h-0 flex-1"><SidebarContent /></nav>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default ModernSidebar;
