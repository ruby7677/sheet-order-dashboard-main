import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CustomerWithStats, CustomerOrder } from '../types/customer';
import { fetchCustomerOrders } from '../services/customerService';
import { useToast } from '@/hooks/use-toast';
import { Phone, MapPin, Calendar, Package, CreditCard } from 'lucide-react';

interface CustomerDetailProps {
  customer: CustomerWithStats | null;
  open: boolean;
  onClose: () => void;
}

const CustomerDetail: React.FC<CustomerDetailProps> = ({ customer, open, onClose }) => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (customer && open) {
      setOrders([]);
      setHistoryError('');
      loadCustomerOrders(customer.normalizedPhone ?? customer.phone);
    }
  }, [customer, open]);

  const loadCustomerOrders = async (phone: string) => {
    setLoading(true);
    setHistoryError('');
    try {
      const customerOrders = await fetchCustomerOrders(phone);
      setOrders(customerOrders);
    } catch (error) {
      const message = error instanceof Error ? error.message : '客戶訂單歷史目前無法讀取，請重新載入。';
      setOrders([]);
      setHistoryError(message);
      toast({
        title: '錯誤',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!customer) {return null;}

  // 格式化日期
  const formatDate = (dateStr: string) => {
    if (!dateStr) {return '';}
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {return dateStr;}
      return date.toLocaleDateString('zh-TW');
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{customer.name} 的客戶資料</DialogTitle>
          <DialogDescription>
            客戶詳細資訊和訂單歷史
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 客戶基本資訊 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">電話：</span>
              <span>{customer.phone}</span>
              {customer.normalizedPhone === null && <span className="text-xs text-amber-700">格式待核對</span>}
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">地區：</span>
              <span>{customer.region}</span>
            </div>
            <div className="flex items-start space-x-2 col-span-1 md:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
              <span className="font-medium">地址：</span>
              <span className="flex-1">{customer.address}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">購買次數：</span>
              <span>{customer.purchaseCount} 次</span>
            </div>
            <div className="flex items-center space-x-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">取貨方式：</span>
              <span>{customer.deliveryMethod}</span>
            </div>
            <div className="flex items-start space-x-2 col-span-1 md:col-span-2">
              <Package className="h-4 w-4 text-muted-foreground mt-1" />
              <span className="font-medium">購買商品：</span>
              <span className="flex-1">{customer.purchasedItems.join('、')}</span>
            </div>
          </div>

          {customer.sourceRecords?.length ? (
            <>
              <Separator />
              <section aria-labelledby="customer-source-records-title" className="space-y-3">
                <h3 id="customer-source-records-title" className="text-lg font-semibold">客戶名單來源紀錄</h3>
                {customer.sourceRecords.map((record) => (
                  <article key={record.rowId} className="space-y-1 rounded border p-3 text-sm">
                    <p>{record.name || customer.name}｜電話：{record.phone || customer.phone}</p>
                    {record.orderTime && <p>日期：{formatDate(record.orderTime)}</p>}
                    {record.deliveryMethod && <p>取貨方式：{record.deliveryMethod}</p>}
                    {record.address && <p>地址：{record.address}</p>}
                    {record.items && <p>品項：{record.items}</p>}
                  </article>
                ))}
              </section>
            </>
          ) : null}

          <Separator />

          {/* 訂單歷史 */}
          <div>
            <h3 className="text-lg font-semibold mb-4">訂單歷史</h3>

            {historyError ? (
              <p role="alert" className="text-destructive">{historyError}</p>
            ) : loading ? (
              <div className="text-center py-4">載入訂單歷史中...</div>
            ) : orders.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">無訂單歷史記錄</div>
            ) : (
              <div className="space-y-4">
                {orders.map((order, index) => (
                  <div key={order.id} className="border rounded-lg p-4 bg-muted/[0.2]">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold">訂單 #{index + 1}</div>
                      <div className="text-sm text-muted-foreground">{formatDate(order.orderTime)}</div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex items-start space-x-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-1" />
                        <span className="font-medium">購買項目：</span>
                        <span className="flex-1">{order.items}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerDetail;
