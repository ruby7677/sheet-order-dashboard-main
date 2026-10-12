import HistoricalPriceSetup from './HistoricalPriceSetup';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import StatusBadge from './StatusBadge';
import PaymentStatusEditor from './PaymentStatusEditor';
import OrderItemEditor from './OrderItemEditor';
import { Order, OrderItem } from '@/types/order';
import { updateOrderStatus, deleteOrder, updateOrderItems, updateOrderPaymentStatus } from '@/services/orderService';
import { printOrders } from '@/utils/exportUtils';
import { Trash, Printer, Edit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OrderDetailProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onOrderStatusUpdate: (
    orderId: string,
    newStatus?: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
    newPaymentStatus?: import('./PaymentStatusEditor').PaymentStatus,
    newItems?: OrderItem[],
    newTotal?: number,
    newRevision?: string
  ) => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({
  order,
  open,
  onClose,
  onOrderStatusUpdate
}) => {
  const [status, setStatus] = useState<'訂單確認中' | '已抄單' | '已出貨' | '取消訂單'>('訂單確認中');
  const [isUpdating, setIsUpdating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<import('./PaymentStatusEditor').PaymentStatus>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [isPricing, setIsPricing] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    if (order) {
      setStatus(order.status as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單');
      setPaymentStatus(order.paymentStatus || '');
      setCurrentOrder(order);
    }
  }, [order]);

  const handleStatusChange = async (newStatus: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單') => {
    if (!order) {return;}

    setIsUpdating(true);
    try {
      const receipt=await updateOrderStatus(
        order.id,
        newStatus as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單',
        (currentOrder||order).revision
      );
      setStatus(newStatus);
      setCurrentOrder(o=>o?{...o,status:newStatus,revision:receipt.revision}:null);
      toast({
        title: '成功',
        description: receipt.warning||'訂單狀態已更新',
      });
      if (order && typeof onOrderStatusUpdate === 'function') {
        onOrderStatusUpdate(order.id, newStatus,undefined,undefined,undefined,receipt.revision);
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
      toast({
        title: '錯誤',
        description: error instanceof Error?error.message:'更新訂單狀態失敗',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePrint = () => {
    if (!order) {return;}
    printOrders([order]);
  };

  const handleDelete = async () => {
    if (!order) {return;}

    // 顯示確認對話框
    const confirmed = window.confirm(
      `確定要刪除訂單 ${order.orderNumber} 嗎？\n\n⚠️ 注意：此操作會同步刪除 Google Sheets 的訂單資料，無法從後台復原。刪除不會回補庫存，請管理員自行調整。`
    );

    if (!confirmed) {
      return; // 用戶取消刪除
    }

    setIsDeleting(true);
    try {
      // 清除快取並刪除訂單
      const result = await deleteOrder(order.id,(currentOrder||order).revision);

      const description = result.warning||'訂單已存檔並從清單移除';

      toast({
        title: '成功',
        description: description,
      });

      // 關閉對話框
      onClose();

      // 通知父組件刷新
      if (order && typeof onOrderStatusUpdate === 'function') {
        // 用特殊狀態通知父組件刷新
        onOrderStatusUpdate(order.id, '__deleted' as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單');
      }
    } catch (error) {
      console.error('刪除訂單失敗:', error);
      toast({
        title: '錯誤',
        description: `刪除訂單 ${order.orderNumber} 失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // 款項狀態更新
  const handlePaymentStatusChange = async (newPaymentStatus: import('./PaymentStatusEditor').PaymentStatus) => {
    if (!order) {return;}
    setIsUpdating(true);
    try {
      // 使用 orderService 中的統一 API 呼叫邏輯
      const receipt=await updateOrderPaymentStatus(order.id, newPaymentStatus,(currentOrder||order).revision);
      setCurrentOrder(o=>o?{...o,paymentStatus:newPaymentStatus,revision:receipt.revision}:null);
      setPaymentStatus(newPaymentStatus);
      toast({
        title: '成功',
        description: '款項狀態已更新',
      });
      // 通知父組件刷新主頁 OrderList 欄位
      if (order && typeof onOrderStatusUpdate === 'function') {
        onOrderStatusUpdate(order.id, undefined, newPaymentStatus,undefined,undefined,receipt.revision); // 讓主頁即時同步款項狀態
      }
    } catch (error) {
      console.error('Failed to update payment status:', error);
      toast({
        title: '錯誤',
        description: error instanceof Error ? error.message : '更新款項狀態失敗',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 商品編輯處理
  const handleEditItems = () => {
    if(!(currentOrder||order)?.can_edit_items){setIsPricing(true);return;}
    setIsEditingItems(true);
  };

  const handleSaveItems = async (newItems: OrderItem[], newTotal: number) => {
    if (!currentOrder) {return;}

    setIsUpdating(true);
    try {
      const receipt=await updateOrderItems(currentOrder.id, newItems, newTotal,currentOrder.revision);

      // 更新本地狀態
      const updatedOrder = {
        ...currentOrder,
        items: receipt.items||newItems,
        total: receipt.total??newTotal,
        revision:receipt.revision
      };
      setCurrentOrder(updatedOrder);

      toast({
        title: '成功',
        description: '訂單商品已更新',
      });

      // 通知父組件刷新清單與統計，同步更新列表中該筆訂單的 items/total
      if (typeof onOrderStatusUpdate === 'function') {
        onOrderStatusUpdate(currentOrder.id, status, undefined,receipt.items||newItems,receipt.total??newTotal,receipt.revision);
      }

      setIsEditingItems(false);
    } catch (error) {
      console.error('Failed to update order items:', error);
      const errorMessage = error instanceof Error ? error.message : '更新訂單商品失敗';
      toast({
        title: '錯誤',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!order) {return null;}

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            <span>訂單詳情 #{order.orderNumber}</span>
            {/* 在狀態徽章上添加右邊距，例如 mr-8 或其他合適的值 */}
            <StatusBadge status={order.status} className="mr-8" />
          </DialogTitle>
        </DialogHeader>

        {/* 修改這裡：添加 max-h-[70vh] (或根據需要調整) 和 overflow-y-auto */}
        <div className="grid gap-6 py-4 max-h-[70vh] overflow-y-auto">
          <div className="text-sm text-muted-foreground">
            訂單建立時間: {order.createdAt}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">客戶資訊</h3>
              <p>{order.customer.name}</p>
              <p>{order.customer.phone}</p>
            </div>

            <div>
              <h3 className="font-medium mb-2">配送資訊</h3>
              <p>配送方式: {order.deliveryMethod}</p>
              <p>配送地址: {order.deliveryAddress}</p>
              <p>到貨日期: {order.dueDate}</p>
              <p>到貨時段: {order.deliveryTime}</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">訂購商品</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditItems}
                disabled={isUpdating||order.operation_pending||order.can_manage===false||(!order.historical&&!order.can_edit_items)}
              >
                <Edit className="h-4 w-4 mr-2" />
                {(currentOrder||order).can_edit_items?'編輯商品':'確認成交單價'}
              </Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">商品</th>
                    <th className="p-2 text-right">單價</th>
                    <th className="p-2 text-right">數量</th>
                    <th className="p-2 text-right">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {(currentOrder || order).items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">{item.product}</td>
                      <td className="p-2 text-right">{(currentOrder||order).unitPricesConfirmed===false?'未確認':'NT$ '+item.price}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right">{(currentOrder||order).unitPricesConfirmed===false?'未確認':'$'+item.subtotal}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={3} className="p-2 text-right font-medium">總計</td>
                    <td className="p-2 text-right font-bold">${(currentOrder || order).total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">付款資訊</h3>
              <p>付款方式: {order.paymentMethod}</p>
              <p>訂單金額: ${(currentOrder || order).total}</p>
            </div>

            {order.notes && (
              <div>
                <h3 className="font-medium mb-2">備註</h3>
                <p>{order.notes}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">訂單狀態</h3>
              <Select value={status} onValueChange={handleStatusChange} disabled={isUpdating||order.operation_pending||order.can_manage===false}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="訂單確認中">訂單確認中</SelectItem>
                  <SelectItem value="已抄單">已抄單</SelectItem>
                  <SelectItem value="已出貨">已出貨</SelectItem>
                  <SelectItem value="取消訂單">取消訂單</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <h3 className="font-medium mb-2">款項狀態</h3>
              <PaymentStatusEditor value={paymentStatus} onChange={handlePaymentStatusChange} disabled={isUpdating||order.operation_pending||order.can_manage===false} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <div className="flex w-full justify-between">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting||order.operation_pending||order.can_manage===false}
            >
              <Trash className="h-4 w-4 mr-2" />
              刪除訂單
            </Button>

            <div className="space-x-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                列印訂單
              </Button>
              <Button onClick={onClose}>關閉</Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* 商品編輯對話框 */}
      {currentOrder && (
        <>
        <HistoricalPriceSetup order={currentOrder||order} open={isPricing} onClose={()=>setIsPricing(false)} onSaved={()=>{window.dispatchEvent(new Event('orders:reload'));onClose();onOrderStatusUpdate(order.id);}}/>
      <OrderItemEditor
          availableProducts={currentOrder.price_options||[]}
          deliveryMethod={currentOrder.deliveryMethod}
          items={currentOrder.items}
          open={isEditingItems}
          onClose={() => setIsEditingItems(false)}
          onSave={handleSaveItems}
          isLoading={isUpdating}
        />
        </>
      )}
    </Dialog>
  );
};

export default OrderDetail;
