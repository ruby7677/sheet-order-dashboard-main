import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import Dashboard from '@/components/Dashboard';
import CustomerDashboard from '@/components/CustomerDashboard';
import OrderFilters, { OrderFiltersRef } from '@/components/OrderFilters';
import CustomerFilters from '@/components/CustomerFilters';
import OrderList from '@/components/OrderList';
import CustomerList from '@/components/CustomerList';
import OrderDetail from '@/components/OrderDetail';
import CustomerDetail from '@/components/CustomerDetail';
import CompactControlPanel from '@/components/CompactControlPanel';
import ModernSidebar from '@/components/ModernSidebar';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import DuplicateOrdersDialog from '@/components/DuplicateOrdersDialog';
import ProductManagementPage from '../pages/ProductManagementPage';
import DeliverySettingsPage from '../pages/DeliverySettingsPage';
import { Order, PaymentStatus, OrderItem } from '@/types/order';
import { CustomerWithStats } from '../types/customer';
import { FilterCriteria } from '../types/filters';
import { CustomerFilterCriteria } from '../types/customer';
import { fetchOrders, detectDuplicateOrders, DuplicateGroup, subscribeDataSourceChange } from '@/services/orderService';
import { fetchCustomers, getCustomerStats } from '@/services/customerService';
import { downloadExcelCsv, printOrders } from '@/utils/exportUtils';
import { downloadQuickStoreXlsx } from '@/utils/exportQuickStoreXlsx';
import { Download, Printer, Calendar, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const Index: React.FC = () => {
  // 檢測是否在 iframe 中
  const [isInIframe, setIsInIframe] = useState(false);

  // 頁面模式：'orders'、'customers'、'products' 或 'delivery-settings'
  const [pageMode, setPageMode] = useState<'orders' | 'customers' | 'products' | 'delivery-settings'>('orders');

  // 訂單相關狀態
  // 已選擇訂單 id 陣列
  const [selected, setSelected] = useState<string[]>([]);
  // 已選擇訂單 id 變動 callback
  const handleSelectedChange = (ids: string[]) => setSelected(ids);

  // 客戶相關狀態
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStats | null>(null);
  const [isCustomerDetailOpen, setIsCustomerDetailOpen] = useState(false);
  const [customerFilters, setCustomerFilters] = useState<CustomerFilterCriteria>({
    region: '',
    purchasedItem: '',
    search: ''
  });
  const [customerDashboardRefreshTrigger, setCustomerDashboardRefreshTrigger] = useState(0);

  // 客戶 id 變動 callback
  const handleSelectedCustomersChange = (ids: string[]) => setSelectedCustomers(ids);

  // 下載快速到店 xlsx
  const handleDownloadQuickStoreXlsx = async () => {
    try {
      const allOrders = await fetchOrders();
      const selectedOrders = allOrders.filter(order => selected.includes(order.id));
      if (selectedOrders.length === 0) {
        toast({
          title: '提示',
          description: '請勾選要匯出的訂單',
        });
        return;
      }
      await downloadQuickStoreXlsx(selectedOrders, `快速到店訂單_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({
        title: '成功',
        description: '快速到店 xlsx 已下載',
      });
    } catch (error) {
      console.error('Failed to download QuickStore xlsx:', error);
      toast({
        title: '錯誤',
        description: '下載快速到店 xlsx 失敗',
        variant: 'destructive',
      });
    }
  };

  // 列印已選擇訂單
  const handlePrintSelected = async () => {
    try {
      const allOrders = await fetchOrders(filters);
      const selectedOrders = allOrders.filter(order => selected.includes(order.id));
      if (selectedOrders.length === 0) {
        toast({ title: '提示', description: '請選擇要列印的訂單' });
        return;
      }
      printOrders(selectedOrders);
    } catch (error) {
      toast({ title: '錯誤', description: '列印失敗', variant: 'destructive' });
    }
  };

  const [filters, setFilters] = useState<FilterCriteria>({
    status: '',
    deliveryMethod: '',
    paymentStatus: '',
    search: ''
  });
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [orderListRef, setOrderListRef] = useState<((orderId: string, newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單', newPaymentStatus?: PaymentStatus, newItems?: OrderItem[], newTotal?: number) => void) | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    processing: 0,
    selected: 0
  });
  const [customerStats, setCustomerStats] = useState({
    total: 0,
    active: 0,
    filteredTotal: 0
  });
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(0);
  const { toast } = useToast();

  // 重複訂單相關狀態
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [hasShownInitialDuplicateAlert, setHasShownInitialDuplicateAlert] = useState(false);
  const [isAutoAlert, setIsAutoAlert] = useState(false);

  // 篩選器 ref，用於重置功能
  const orderFiltersRef = useRef<OrderFiltersRef>(null);

  // 開啟到貨日設定頁面
  const openDeliverySettings = () => {
    window.open('http://lopokao.767780.xyz/admin-delivery-settings.php', '_blank', 'width=800,height=900,scrollbars=yes,resizable=yes');
  };

  useEffect(() => {
    // 更新重複訂單檢測
    const updateDuplicateOrdersLocal = (orders: Order[], isInitialLoad: boolean = false) => {
      const duplicates = detectDuplicateOrders(orders);
      setDuplicateGroups(duplicates);

      // 如果是初次載入且有重複訂單且尚未顯示過警示，則自動彈窗
      if (isInitialLoad && duplicates.length > 0 && !hasShownInitialDuplicateAlert) {
        setIsAutoAlert(true); // 設定為自動警示模式
        setShowDuplicateDialog(true);
        setHasShownInitialDuplicateAlert(true);
      }
    };

    // 初始載入時的統計更新（會觸發重複訂單警示）
    const updateStatsInitial = async () => {
      try {
        const allOrders = await fetchOrders();
        setStats({
          total: allOrders.length,
          processing: allOrders.filter(order => order.status === '已抄單').length,
          selected: 0
        });

        // 更新重複訂單檢測，標記為初次載入
        updateDuplicateOrdersLocal(allOrders, true);
      } catch (error) {
        console.error('Failed to update stats:', error);
      }
    };

    updateStatsInitial();
    updateCustomerStats();

    // 在預覽環境中也顯示側邊欄和頂部欄
    setIsInIframe(false);

    // 處理來自父視窗的訊息
    const handleMessage = (event: MessageEvent) => {
      // 確保事件來源是期望的父視窗，如果需要更強的安全性
      // if (event.origin !== 'YOUR_PARENT_DOMAIN') {
      //   return;
      // }

      if (event.data && typeof event.data === 'object' && event.data.type === 'SET_PAGE_MODE') {
        if (event.data.mode === 'orders' || event.data.mode === 'customers' || event.data.mode === 'products' || event.data.mode === 'delivery-settings') {
          setPageMode(event.data.mode);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [hasShownInitialDuplicateAlert]); // 依賴項包含相關狀態

  // 監聽資料來源變更：清空快取並重新載入
  useEffect(() => {
    const unsub = subscribeDataSourceChange(() => {
      setSelected([]);
      setSelectedCustomers([]);
      setDashboardRefreshTrigger(prev => prev + 1);
      setCustomerDashboardRefreshTrigger(prev => prev + 1);
      // 觸發 OrderList 重新載入（filters 物件引用變更）
      setFilters(prev => ({ ...prev }));
      // 重新整理客戶統計
      updateCustomerStats();
    });
    return () => {
      if (unsub) unsub();
    };
  }, []);


  // 一般的統計更新（不會觸發自動警示）
  const updateStats = async () => {
    try {
      const allOrders = await fetchOrders();
      setStats({
        total: allOrders.length,
        processing: allOrders.filter(order => order.status === '已抄單').length,
        selected: 0
      });

      // 更新重複訂單檢測，不是初次載入
      updateDuplicateOrders(allOrders, false);
    } catch (error) {
      console.error('Failed to update stats:', error);
    }
  };

  // 更新重複訂單檢測
  const updateDuplicateOrders = (orders: Order[], isInitialLoad: boolean = false) => {
    const duplicates = detectDuplicateOrders(orders);
    setDuplicateGroups(duplicates);

    // 如果是初次載入且有重複訂單且尚未顯示過警示，則自動彈窗
    if (isInitialLoad && duplicates.length > 0 && !hasShownInitialDuplicateAlert) {
      setIsAutoAlert(true); // 設定為自動警示模式
      setShowDuplicateDialog(true);
      setHasShownInitialDuplicateAlert(true);
    }
  };

  // 處理重複訂單按鈕點擊
  const handleDuplicateOrdersClick = () => {
    setIsAutoAlert(false); // 設定為手動模式
    setShowDuplicateDialog(true);
  };

  // 處理重複訂單對話框中的訂單點擊
  const handleDuplicateOrderClick = async (orderId: string) => {
    try {
      // 關閉重複訂單對話框
      setShowDuplicateDialog(false);

      // 獲取所有訂單資料
      const allOrders = await fetchOrders();

      // 找到對應的訂單
      const targetOrder = allOrders.find(order => order.id === orderId);

      if (targetOrder) {
        // 開啟訂單詳情
        setSelectedOrder({ ...targetOrder });
        setIsDetailOpen(true);

        // 設定一個空的更新函數，因為從重複訂單對話框開啟的詳情不需要更新列表
        setOrderListRef(() => (
          orderId: string,
          newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
          newPaymentStatus?: PaymentStatus,
          newItems?: OrderItem[],
          newTotal?: number
        ) => {
          console.log('訂單更新:', orderId, newStatus, newPaymentStatus, newItems, newTotal);
        });
      } else {
        toast({
          title: '錯誤',
          description: '找不到指定的訂單',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('開啟訂單詳情失敗:', error);
      toast({
        title: '錯誤',
        description: '開啟訂單詳情失敗',
        variant: 'destructive',
      });
    }
  };

  const updateCustomerStats = async () => {
    try {
      const allCustomers = await fetchCustomers();
      const stats = getCustomerStats(allCustomers);
      setCustomerStats({
        total: stats.total,
        active: allCustomers.filter(customer => customer.purchaseCount > 0).length,
        filteredTotal: stats.total
      });
    } catch (error) {
      console.error('Failed to update customer stats:', error);
    }
  };

  const handleFilterChange = (newFilters: FilterCriteria) => {
    setFilters(newFilters);
  };

  const handleOrderClick = (
    order: Order,
    updateOrderInList: (
      orderId: string,
      newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
      newPaymentStatus?: PaymentStatus,
      newItems?: OrderItem[],
      newTotal?: number
    ) => void
  ) => {
    setSelectedOrder({ ...order });
    setIsDetailOpen(true);
    setOrderListRef(() => updateOrderInList);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedOrder(null);
  };

  const handleOrdersChange = () => {
    updateStats(); // 這會同時更新重複訂單檢測
    // 觸發 Dashboard 重新載入
    setDashboardRefreshTrigger(prev => prev + 1);
  };

  // 客戶相關處理函數
  const handleCustomerFilterChange = (newFilters: Partial<CustomerFilterCriteria>) => {
    setCustomerFilters(prev => ({ ...prev, ...newFilters }));
    // 當篩選條件改變時，更新客戶統計
    updateCustomerStatsWithFilters({ ...customerFilters, ...newFilters });
  };

  const handleCustomerClick = (customer: CustomerWithStats) => {
    setSelectedCustomer(customer);
    setIsCustomerDetailOpen(true);
  };

  const handleCloseCustomerDetail = () => {
    setIsCustomerDetailOpen(false);
    setSelectedCustomer(null);
  };

  const handleCustomersChange = () => {
    // 觸發 CustomerDashboard 重新載入
    setCustomerDashboardRefreshTrigger(prev => prev + 1);
    // 更新客戶統計
    updateCustomerStats();
  };

  // 根據篩選條件更新客戶統計
  const updateCustomerStatsWithFilters = async (filters: CustomerFilterCriteria) => {
    try {
      const filteredCustomers = await fetchCustomers(filters);
      setCustomerStats(prev => ({
        ...prev,
        filteredTotal: filteredCustomers.length
      }));
    } catch (error) {
      console.error('Failed to update filtered customer stats:', error);
    }
  };

  // 處理客戶總數變化
  const handleCustomerTotalCountChange = (total: number) => {
    setCustomerStats(prev => ({
      ...prev,
      filteredTotal: total
    }));
  };

  // 重置訂單篩選器
  const handleResetOrderFilters = () => {
    if (orderFiltersRef.current) {
      orderFiltersRef.current.resetFilters();
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const allOrders = await fetchOrders();
      const selectedOrders = allOrders.filter(order => selected.includes(order.id));
      if (selectedOrders.length === 0) {
        toast({
          title: '提示',
          description: '請勾選要匯出的訂單',
        });
        return;
      }
      // 使用Excel專用的CSV下載功能，解決中文亂碼問題
      downloadExcelCsv(selectedOrders, `訂單資料_${new Date().toISOString().split('T')[0]}.csv`);
      toast({
        title: '成功',
        description: 'CSV檔案已下載（Unicode UTF-8編碼）',
      });
    } catch (error) {
      console.error('Failed to download CSV:', error);
      toast({
        title: '錯誤',
        description: '下載CSV檔案失敗',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* 側邊欄 - 只在非 iframe 模式下顯示 */}
      {!isInIframe && (
        <ModernSidebar
          pageMode={pageMode}
          onPageModeChange={setPageMode}
          orderStats={{
            total: stats.total,
            pending: stats.processing,
            completed: stats.selected
          }}
          customerStats={{
            total: customerStats.total,
            active: customerStats.active
          }}
        />
      )}

      {/* 主內容區域 */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* 只在非 iframe 模式下顯示頂部工具欄 */}
        {!isInIframe && (
          <header className="border-b bg-card/[0.5] backdrop-blur-sm sticky top-0 z-40">
            <div className="px-4 lg:px-6 pl-14 lg:pl-6 py-3 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-foreground">
                  {pageMode === 'orders' ? '訂單管理' : 
                   pageMode === 'customers' ? '客戶資料' : 
                   pageMode === 'products' ? '商品管理' : '設定到貨日期'}
                </h1>
                <div className="text-sm text-muted-foreground hidden sm:block">
                  蘿蔔糕訂單系統 - 管理後台
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://767780.xyz/pos8-test.php', '_blank')}
                  className="h-8 px-3 text-xs border-2 border-blue-400-80 text-blue-600 hover:bg-blue-50 hover:border-blue-500 transition-all font-medium"
                >
                  {/* 可以考慮加上一個圖示，例如 <FilePenLine className="h-3 w-3 mr-1" /> */}
                  手抄單
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDeliverySettings}
                  className="h-8 px-3 text-xs border-2 border-purple-400-80 text-purple-600 hover:bg-purple-50 hover:border-purple-500 transition-all font-medium"
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  設定到貨日期
                </Button>
              </div>
            </div>
          </header>
        )}

      {/* iframe 模式下的簡化導航按鈕已移除 */}

        <main className={`flex-1 ${isInIframe ? 'p-3' : 'p-6'}`}>

        {/* 訂單頁面 */}
        {pageMode === 'orders' && (
          <>
            {/* 整合式控制面板 */}
            <CompactControlPanel
              statsComponent={<Dashboard refreshTrigger={dashboardRefreshTrigger} compact={true} />}
              filtersComponent={<OrderFilters ref={orderFiltersRef} onFilterChange={handleFilterChange} />}
              onResetFilters={handleResetOrderFilters}
              actionButtons={
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs border-2 border-yellow-400-80 text-yellow-600 hover:bg-yellow-50 hover:border-yellow-500 transition-all font-medium"
                    onClick={handleDuplicateOrdersClick}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    重複訂單({duplicateGroups.reduce((sum, group) => sum + group.count, 0)})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs border-2 border-orange-400-80 text-orange-600 hover:bg-orange-50 hover:border-orange-500 transition-all font-medium"
                    onClick={handlePrintSelected}
                  >
                    <Printer className="h-3 w-3 mr-1" /> 列印訂單
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs border-2 border-blue-400-80 text-blue-600 hover:bg-blue-50 hover:border-blue-500 transition-all font-medium"
                    onClick={handleDownloadCsv}
                  >
                    <Download className="h-3 w-3 mr-1" /> 宅配CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs border-2 border-green-400-80 text-green-600 hover:bg-green-50 hover:border-green-500 transition-all font-medium"
                    onClick={handleDownloadQuickStoreXlsx}
                  >
                    <Download className="h-3 w-3 mr-1" /> 快速到店
                  </Button>
                </>
              }
              totalItems={stats.total}
              selectedCount={selected.length}
              itemType="訂單"
              defaultExpanded={false}
            />

            <OrderList
              filters={filters}
              onOrderClick={handleOrderClick}
              onOrdersChange={handleOrdersChange}
              selected={selected}
              onSelectedChange={handleSelectedChange}
            />

            <OrderDetail
              order={selectedOrder}
              open={isDetailOpen}
              onClose={handleCloseDetail}
              onOrderStatusUpdate={(orderId, newStatus, newPaymentStatus, newItems?: OrderItem[], newTotal?: number) => {
                if (orderListRef) {orderListRef(orderId, newStatus, newPaymentStatus, newItems, newTotal);}
                handleOrdersChange();
              }}
            />
          </>
        )}

        {/* 客戶頁面 */}
        {pageMode === 'customers' && (
          <>
            {/* 客戶整合式控制面板 */}
            <CompactControlPanel
              statsComponent={<CustomerDashboard refreshTrigger={customerDashboardRefreshTrigger} compact={true} />}
              filtersComponent={<CustomerFilters onFilterChange={handleCustomerFilterChange} />}
              actionButtons={
                <>
                  {/* 客戶相關的操作按鈕可以在這裡添加 */}
                </>
              }
              totalItems={customerStats.filteredTotal}
              selectedCount={selectedCustomers.length}
              itemType="客戶"
              defaultExpanded={false}
            />

            <CustomerList
              filters={customerFilters}
              onCustomerClick={handleCustomerClick}
              onCustomersChange={handleCustomersChange}
              selected={selectedCustomers}
              onSelectedChange={handleSelectedCustomersChange}
              onTotalCountChange={handleCustomerTotalCountChange}
            />

            <CustomerDetail
              customer={selectedCustomer}
              open={isCustomerDetailOpen}
              onClose={handleCloseCustomerDetail}
            />
          </>
        )}

        {/* 商品管理頁面 */}
        {pageMode === 'products' && (
          <ProductManagementPage />
        )}

        {/* 設定到貨日期頁面 */}
        {pageMode === 'delivery-settings' && (
          <DeliverySettingsPage onBack={() => setPageMode('orders')} />
        )}
        </main>
      </div>

      {/* 回頂端浮動按鈕 */}
      <ScrollToTopButton threshold={40} />

      {/* 重複訂單對話框 */}
      <DuplicateOrdersDialog
        isOpen={showDuplicateDialog}
        onClose={() => setShowDuplicateDialog(false)}
        duplicateGroups={duplicateGroups}
        onOrderClick={handleDuplicateOrderClick}
        isAutoAlert={isAutoAlert}
      />
    </div>
  );
};

export default Index;
