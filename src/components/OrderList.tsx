import React, { useState, useEffect } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import StatusBadge from './StatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';
import BatchDeleteConfirmDialog from './BatchDeleteConfirmDialog';
import { fetchOrders, deleteOrder, batchUpdateOrderStatus, batchUpdateOrderPaymentStatus, batchDeleteOrders, clearOrderCache, isOrderDuplicate } from '@/services/orderService';
import { Order } from '@/types/order';
import { printOrders } from '@/utils/exportUtils';
import { Trash, ChevronLeft, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PaymentStatus } from './PaymentStatusEditor';
import { cn } from '@/lib/utils';

// OrderList 元件的屬性型別
import { FilterCriteria } from '@/types/filters';

interface OrderListProps {
  /** 訂單過濾條件 */
  filters: FilterCriteria;
  /** 點擊訂單時的 callback，可傳入 updateOrderInList */
  onOrderClick: (order: Order, updateOrderInList: (orderId: string, newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單', newPaymentStatus?: PaymentStatus) => void) => void;
  /** 訂單資料變動時的 callback */
  onOrdersChange: () => void;
  /** 已選擇訂單 id 陣列，由父元件管理 */
  selected: string[];
  /** 已選擇訂單 id 變動時的 callback，由父元件提供 */
  onSelectedChange: (selected: string[]) => void;
}

// OrderList 訂單列表元件
// 完全由父元件管理已選擇訂單狀態
const OrderList: React.FC<OrderListProps> = ({ filters, onOrderClick, onOrdersChange, selected, onSelectedChange }) => {
  // 訂單狀態更新 in-place
  // 支援同時更新 status 及 paymentStatus，避免只改款項時 status 遺失
  const [batchOrderStatus, setBatchOrderStatus] = useState('');
  const [batchPaymentStatus, setBatchPaymentStatus] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  // 批次刪除相關狀態
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  // 分頁相關狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 20; // 每頁顯示 20 筆訂單

  // 訂單狀態更新 in-place
  // 支援同時更新 status 及 paymentStatus，避免只改款項時 status 遺失
  const updateOrderInList = (
    orderId: string,
    newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
    newPaymentStatus?: PaymentStatus
  ) => {
    setOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        status: newStatus !== undefined ? newStatus : order.status,
        paymentStatus: newPaymentStatus !== undefined ? newPaymentStatus : order.paymentStatus
      };
    }));
  };

  // 訂單資料狀態
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]); // 儲存所有訂單資料
  // 載入狀態
  const [loading, setLoading] = useState<boolean>(true);
  const { toast } = useToast();

  // 載入訂單的共用函式
  const reloadOrders = async () => {
    setLoading(true);
    try {
      // 先清除快取，確保從伺服器獲取最新資料
      clearOrderCache();
      const data = await fetchOrders(filters);
      setAllOrders(data); // 儲存所有訂單
      setTotalPages(Math.ceil(data.length / itemsPerPage)); // 計算總頁數

      // 決定當前頁面
      // 如果當前頁碼大於新的總頁數，則設為最後一頁
      const newCurrentPage = currentPage > Math.ceil(data.length / itemsPerPage)
        ? Math.ceil(data.length / itemsPerPage) || 1
        : currentPage;

      setCurrentPage(newCurrentPage);

      // 顯示當前頁的資料
      const startIndex = (newCurrentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, data.length);
      setOrders(data.slice(startIndex, endIndex));

      // 保留已選中但仍然存在於新資料中的訂單IDs
      if (selected.length > 0) {
        const existingIds = data.map(order => order.id);
        const stillExistingSelectedIds = selected.filter(id => existingIds.includes(id));
        onSelectedChange(stillExistingSelectedIds);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
      toast({
        title: '錯誤',
        description: '載入訂單失敗',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 切換頁面的函數
  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allOrders.length);
    setOrders(allOrders.slice(startIndex, endIndex));
  };

  // 過濾條件變動時重新載入訂單
  useEffect(() => {
    reloadOrders();
  }, [filters]);


  // 單筆選取/取消
  const handleSelectOrder = (orderId: string, checked: boolean) => {
    if (checked) {
      onSelectedChange([...selected, orderId]);
    } else {
      onSelectedChange(selected.filter(id => id !== orderId));
    }
  };

  // 全選/全不選
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // 只全選當前頁面的訂單
      const currentPageOrderIds = orders.map(order => order.id);
      // 過濾掉已經被選取但不在當前頁面的訂單
      const selectedFromOtherPages = selected.filter(id => !currentPageOrderIds.includes(id));
      onSelectedChange([...selectedFromOtherPages, ...currentPageOrderIds]);
    } else {
      // 取消選取當前頁面的訂單
      const currentPageOrderIds = orders.map(order => order.id);
      onSelectedChange(selected.filter(id => !currentPageOrderIds.includes(id)));
    }
  };

  // 列印已選擇訂單
  const handlePrintSelected = () => {
    const selectedOrderData = allOrders.filter(order => selected.includes(order.id));
    if (selectedOrderData.length === 0) {
      toast({
        title: '提示',
        description: '請選擇要列印的訂單',
      });
      return;
    }
    printOrders(selectedOrderData);
  };

  const handleDeleteOrder = async (orderId: string) => {
    // 找到要刪除的訂單資訊
    const orderToDelete = allOrders.find(order => order.id === orderId);
    const orderNumber = orderToDelete?.orderNumber || orderId;

    // 顯示確認對話框
    const confirmed = window.confirm(
      `確定要刪除訂單 ${orderNumber} 嗎？\n\n⚠️ 注意：此操作將會從 Google Sheets 中永久刪除該訂單資料，無法復原！`
    );

    if (!confirmed) {
      return; // 用戶取消刪除
    }

    try {
      const result = await deleteOrder(orderId);

      // 檢查是否有重排序結果
      let description = `訂單 ${orderNumber} 已從 Google Sheets 中永久刪除`;
      if (result && result.reorder_result) {
        if (result.reorder_result.success && result.reorder_result.updated_rows > 0) {
          description += `，已重新排序 ${result.reorder_result.updated_rows} 個後續訂單的ID`;
        } else if (result.reorder_result.updated_rows === 0) {
          description += `，無需重新排序後續訂單`;
        }
      }

      toast({
        title: '成功',
        description: description,
      });

      // 清除選擇的訂單
      if (selected.includes(orderId)) {
        const newSelected = selected.filter(id => id !== orderId);
        onSelectedChange(newSelected);
      }

      // 強制清除快取並重新載入訂單
      clearOrderCache();
      await reloadOrders();

      // 通知父組件訂單已變更，觸發統計數據更新
      if (typeof onOrdersChange === 'function') {
        onOrdersChange();
      }
    } catch (error) {
      console.error('刪除訂單失敗:', error);
      toast({
        title: '錯誤',
        description: `刪除訂單 ${orderNumber} 失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        variant: 'destructive',
      });
    }
  };

  // 處理批次刪除訂單
  const handleBatchDelete = () => {
    if (selected.length === 0) {
      toast({
        title: '提示',
        description: '請選擇要刪除的訂單',
      });
      return;
    }
    setShowBatchDeleteDialog(true);
  };

  // 確認批次刪除
  const handleConfirmBatchDelete = async () => {
    if (selected.length === 0) return;

    setBatchDeleting(true);
    try {
      const result = await batchDeleteOrders(selected);

      // 處理結果
      const successCount = result.totalDeleted;
      const failedCount = result.totalFailed;

      if (failedCount === 0) {
        // 全部成功
        toast({
          title: '成功',
          description: `已成功刪除 ${successCount} 筆訂單`,
        });
      } else if (successCount === 0) {
        // 全部失敗
        toast({
          title: '錯誤',
          description: `刪除失敗，共 ${failedCount} 筆訂單刪除失敗`,
          variant: 'destructive',
        });
      } else {
        // 部分成功
        const failedOrders = result.results
          .filter(r => !r.success)
          .map(r => r.orderNumber || r.id)
          .join('、');

        toast({
          title: '部分成功',
          description: `成功刪除 ${successCount} 筆，失敗 ${failedCount} 筆。失敗的訂單：${failedOrders}`,
          variant: 'destructive',
        });
      }

      // 清除選擇的訂單
      onSelectedChange([]);

      // 強制清除快取並重新載入訂單
      clearOrderCache();
      await reloadOrders();

      // 通知父組件訂單已變更，觸發統計數據更新
      if (typeof onOrdersChange === 'function') {
        onOrdersChange();
      }

    } catch (error) {
      console.error('批次刪除訂單失敗:', error);
      toast({
        title: '錯誤',
        description: `批次刪除訂單失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        variant: 'destructive',
      });
    } finally {
      setBatchDeleting(false);
      setShowBatchDeleteDialog(false);
    }
  };

  return (
    <div className="bg-card border rounded-lg shadow-sm overflow-hidden max-w-7xl mx-auto">
      {/* 批次操作區塊 - 優化設計 */}
      {selected.length > 0 && (
        <div className="border-b bg-gradient-to-r from-orange-50 to-red-50 p-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
              <span className="bg-orange-100 px-2 py-1 rounded-full text-xs">
                已選擇 {selected.length} 筆
              </span>
              批次操作:
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {/* 訂單狀態批次更新 */}
              <div className="flex items-center gap-1">
                <select
                  className="border border-orange-200 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                  value={batchOrderStatus}
                  onChange={e => setBatchOrderStatus(e.target.value)}
                  disabled={batchLoading}
                >
                  <option value="">選擇訂單狀態</option>
                  <option value="訂單確認中">訂單確認中</option>
                  <option value="已抄單">已抄單</option>
                  <option value="已出貨">已出貨</option>
                  <option value="取消訂單">取消訂單</option>
                </select>
                <Button
                  onClick={async () => {
                    if (!batchOrderStatus || selected.length === 0) return;
                    setBatchLoading(true);
                    try {
                      await batchUpdateOrderStatus(selected, batchOrderStatus as any);
                      toast({
                        title: '成功',
                        description: '訂單狀態已批次更新',
                      });
                      await reloadOrders();
                      setBatchOrderStatus('');
                      onOrdersChange();
                    } catch (error) {
                      toast({
                        title: '錯誤',
                        description: '批次更新訂單狀態失敗',
                        variant: 'destructive',
                      });
                    } finally {
                      setBatchLoading(false);
                    }
                  }}
                  disabled={!batchOrderStatus || batchLoading}
                  size="sm"
                  className="h-8 px-3 bg-orange-600 hover:bg-orange-700"
                >
                  更新狀態
                </Button>
              </div>

              {/* 款項狀態批次更新 */}
              <div className="flex items-center gap-1">
                <select
                  className="border border-orange-200 rounded px-2 py-1 text-sm bg-white focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
                  value={batchPaymentStatus}
                  onChange={e => setBatchPaymentStatus(e.target.value)}
                  disabled={batchLoading}
                >
                  <option value="">選擇款項狀態</option>
                  <option value="未收費">未收費</option>
                  <option value="已收費">已收費</option>
                  <option value="待轉帳">待轉帳</option>
                  <option value="未全款">未全款</option>
                  <option value="特殊">特殊</option>
                </select>
                <Button
                  onClick={async () => {
                    if (!batchPaymentStatus || selected.length === 0) return;
                    setBatchLoading(true);
                    try {
                      await batchUpdateOrderPaymentStatus(selected, batchPaymentStatus);
                      toast({
                        title: '成功',
                        description: '款項狀態已批次更新',
                      });
                      // 確保前端顯示更新
                      await reloadOrders();
                      setBatchPaymentStatus('');
                      onOrdersChange();
                    } catch (error) {
                      console.error('批次更新款項狀態失敗:', error);
                      toast({
                        title: '錯誤',
                        description: '批次更新款項狀態失敗',
                        variant: 'destructive',
                      });
                    } finally {
                      setBatchLoading(false);
                    }
                  }}
                  disabled={!batchPaymentStatus || batchLoading}
                  size="sm"
                  className="h-8 px-3 bg-red-600 hover:bg-red-700"
                >
                  更新款項
                </Button>
              </div>

              {/* 批次刪除按鈕 */}
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleBatchDelete}
                  disabled={selected.length === 0 || batchLoading}
                  size="sm"
                  className="h-8 px-3 bg-red-700 hover:bg-red-800 text-white border-2 border-red-700 hover:border-red-800 font-medium"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  批次刪除 ({selected.length})
                </Button>
              </div>

              {batchLoading && (
                <div className="flex items-center gap-1 text-sm text-orange-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                  處理中...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-200">
            <tr className="text-left text-slate-700">
              <th className="p-3 font-semibold w-12 md:w-16">
                <Checkbox
                  checked={orders.length > 0 && orders.every(order => selected.includes(order.id))}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                  aria-label="Select all orders"
                  className="border-slate-400"
                />
              </th>
              <th className="p-3 font-semibold w-16 min-w-[48px] text-center">
                <span className="text-xs">訂單<br/>編號</span>
              </th>
              <th className="p-3 font-semibold w-40 min-w-[120px] max-w-[180px]">客戶資訊</th>
              <th className="p-3 font-semibold w-72 min-w-[200px] max-w-[320px]">商品摘要</th>
              <th className="p-3 font-semibold w-24 min-w-[80px] text-right">總金額</th>
              <th className="p-3 font-semibold w-28 min-w-[100px]">到貨日期</th>
              <th className="p-3 font-semibold w-32 min-w-[120px] max-w-[160px]">備註</th>
              <th className="p-3 font-semibold w-28 min-w-[100px]">訂單狀態</th>
              <th className="p-3 font-semibold w-24 min-w-[100px]">款項狀態</th>
              <th className="p-3 font-semibold w-16 min-w-[64px] text-center">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-500"></div>
                    載入中...
                  </div>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-slate-400 text-lg">📋</div>
                    無訂單資料
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((order, index) => (
                <tr
                  key={order.id}
                  className={cn(
                    "transition-all duration-200 cursor-pointer group",
                    "hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50",
                    "hover:shadow-sm",
                    selected.includes(order.id)
                      ? "bg-gradient-to-r from-blue-100/70 to-indigo-100/70 shadow-sm"
                      : index % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                  )}
                  onClick={() => onOrderClick(order, updateOrderInList)}
                >
                  <td className="p-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(order.id)}
                      onCheckedChange={(checked) => handleSelectOrder(order.id, !!checked)}
                      aria-label={`Select order ${order.orderNumber}`}
                      className="border-slate-400 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                  </td>
                  <td className="p-3 w-16 text-center">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">
                      {order.orderNumber}
                    </span>
                  </td>
                  <td className="p-3 w-40 max-w-[180px]">
                    <div className="space-y-1">
                      <div className="font-medium text-slate-900 break-words">{order.customer.name}</div>
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-slate-500 break-words font-mono">{order.customer.phone}</div>
                        {isOrderDuplicate(order, allOrders) && (
                          <div title="重複電話號碼">
                            <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 w-72 max-w-[320px]">
                    <div className="text-sm text-slate-700 whitespace-pre-line break-words line-clamp-2">
                      {order.items.map(item => `${item.product} x${item.quantity}`).join('、')}
                    </div>
                  </td>
                  <td className="p-3 w-24 text-right">
                    <span className="font-semibold text-slate-900">${order.total}</span>
                  </td>
                  <td className="p-3 w-28">
                    <span className="text-sm text-slate-700">{order.dueDate}</span>
                  </td>
                  <td className="p-3 w-32 max-w-[160px]">
                    <div className="text-sm text-slate-600 whitespace-pre-line break-words line-clamp-2">
                      {order.notes || <span className="text-slate-400 italic">無備註</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={order.status as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'} />
                  </td>
                  <td className="p-3">
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </td>
                  <td className="p-3 w-16 text-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      onClick={() => handleDeleteOrder(order.id)}
                      aria-label={`Delete order ${order.orderNumber}`}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分頁控制 */}
      {!loading && totalPages > 1 && (
        <div className="p-4 flex justify-between items-center border-t mr-16">
          <div className="text-sm text-muted-foreground">
            顯示 {((currentPage - 1) * itemsPerPage) + 1} 至 {Math.min(currentPage * itemsPerPage, allOrders.length)} 筆，共 {allOrders.length} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-2 h-8"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-1">上一頁</span>
            </Button>

            <div className="flex items-center gap-1">
              {/* 顯示頁碼 */}
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                // 計算頁碼顯示邏輯，最多顯示 5 個頁碼
                const pageNumbersToShow = 5;
                let startPage = Math.max(1, currentPage - Math.floor(pageNumbersToShow / 2));
                const endPage = Math.min(totalPages, startPage + pageNumbersToShow - 1);

                // 調整 startPage，確保顯示的頁碼數量是固定的
                startPage = Math.max(1, endPage - pageNumbersToShow + 1);

                const pageNumber = startPage + i;
                // 確保不超過總頁數
                if (pageNumber > totalPages) return null;

                return (
                  <Button
                    key={pageNumber}
                    variant={pageNumber === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNumber)}
                    className={`px-3 h-8 w-8 ${pageNumber === currentPage ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {pageNumber}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-2 h-8"
            >
              <span className="mr-1">下一頁</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 已選擇筆數與列印按鈕，顯示父元件傳入的 selected 長度 */}
      {selected.length > 0 && (
        <div className="bg-muted p-3 flex justify-between items-center">
          <div>已選擇: {selected.length} 筆訂單</div>
          <Button onClick={handlePrintSelected}>列印訂單({selected.length})</Button>
        </div>
      )}

      {/* 批次刪除確認對話框 */}
      <BatchDeleteConfirmDialog
        isOpen={showBatchDeleteDialog}
        onClose={() => setShowBatchDeleteDialog(false)}
        onConfirm={handleConfirmBatchDelete}
        orders={allOrders.filter(order => selected.includes(order.id))}
        isDeleting={batchDeleting}
      />
    </div>
  );
};

export default OrderList;
