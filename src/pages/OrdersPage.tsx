// Linus式订单页面 - 只处理订单逻辑
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import Dashboard from '@/components/Dashboard';
import OrderFilters, { OrderFiltersRef } from '@/components/OrderFilters';
import OrderList from '@/components/OrderList';
import OrderDetail from '@/components/OrderDetail';
import CompactControlPanel from '@/components/CompactControlPanel';
import DuplicateOrdersDialog from '@/components/DuplicateOrdersDialog';
import { Order, PaymentStatus, OrderItem } from '@/types/order';
import { FilterCriteria } from '@/types/filters';
import { fetchOrders, detectDuplicateOrders, DuplicateGroup } from '@/services/orderService';
import { downloadBlackCatXls, printOrders } from '@/utils/exportUtils';
import { downloadQuickStoreXlsx } from '@/utils/exportQuickStoreXlsx';
import { Download, Printer, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const OrdersPage: React.FC = () => {
  const { toast } = useToast();
  
  // 只处理订单相关状态
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [filters, setFilters] = useState<FilterCriteria>({
    status: '',
    deliveryMethod: '',
    paymentStatus: '',
    search: '',
    date: ''
  });
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(0);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isDuplicateDialogOpen, setIsDuplicateDialogOpen] = useState(false);

  const handleSelectedChange = (ids: string[]) => setSelected(ids);

  // 订单业务逻辑
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

  const handleDownloadBlackCat = async () => {
    try {
      const allOrders = await fetchOrders();
      const selectedOrders = allOrders.filter(order => selected.includes(order.id));
      if (selectedOrders.length === 0) {
        toast({
          title: '提示',
          description: '請選擇要下載的訂單',
        });
        return;
      }
      await downloadBlackCatXls(selectedOrders, `黑猫宅急便訂單_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast({
        title: '成功',
        description: '黑猫宅急便 xlsx 已下載',
      });
    } catch (error) {
      console.error('Failed to download Black Cat xlsx:', error);
      toast({
        title: '錯誤',
        description: '下載黑猫宅急便 xlsx 失敗',
        variant: 'destructive',
      });
    }
  };

  const handleCheckDuplicates = async () => {
    try {
      const allOrders = await fetchOrders();
      const duplicates = detectDuplicateOrders(allOrders);
      setDuplicateGroups(duplicates);
      setIsDuplicateDialogOpen(true);
    } catch (error) {
      toast({
        title: '錯誤',
        description: '檢查重複訂單失敗',
        variant: 'destructive',
      });
    }
  };

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setIsOrderDetailOpen(true);
  };

  const handleCloseOrderDetail = () => {
    setIsOrderDetailOpen(false);
    setSelectedOrder(null);
  };

  const refreshData = () => {
    setDashboardRefreshTrigger(prev => prev + 1);
  };

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col">
        <Dashboard 
          refreshTrigger={dashboardRefreshTrigger} 
          filters={filters}
        />
        
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-80 flex-shrink-0">
                <OrderFilters
                  onFiltersChange={setFilters}
                  onRefresh={refreshData}
                />
              </div>
              <div className="flex-1 min-w-0">
                <CompactControlPanel
                  selectedCount={selected.length}
                  onDownloadQuickStore={handleDownloadQuickStoreXlsx}
                  onDownloadBlackCat={handleDownloadBlackCat}
                  onPrint={handlePrintSelected}
                  onCheckDuplicates={handleCheckDuplicates}
                />
              </div>
            </div>

            <OrderList
              filters={filters}
              refreshTrigger={dashboardRefreshTrigger}
              onSelectedChange={handleSelectedChange}
              onOrderClick={handleOrderClick}
              onRefreshData={refreshData}
            />
          </div>
        </div>

        {selectedOrder && (
          <OrderDetail
            order={selectedOrder}
            isOpen={isOrderDetailOpen}
            onClose={handleCloseOrderDetail}
            onUpdate={refreshData}
          />
        )}

        <DuplicateOrdersDialog
          isOpen={isDuplicateDialogOpen}
          onClose={() => setIsDuplicateDialogOpen(false)}
          duplicateGroups={duplicateGroups}
          onRefresh={refreshData}
        />
      </div>
    </main>
  );
};

export default OrdersPage;