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
  const { toast } = useToast();

  useEffect(() => {
    if (customer && open) {
      loadCustomerOrders(customer.phone);
    }
  }, [customer, open]);

  const loadCustomerOrders = async (phone: string) => {
    setLoading(true);
    console.log('🔄 開始載入客戶訂單歷史:', phone);
    
    try {
      const customerOrders = await fetchCustomerOrders(phone);
      console.log('📦 載入的訂單數量:', customerOrders.length, customerOrders);
      setOrders(customerOrders);
      
      if (customerOrders.length === 0) {
        console.log('⚠️ 未找到該客戶的訂單記錄');
      }
    } catch (error) {
      console.error('❌ 載入客戶訂單歷史失敗:', error);
      toast({
        title: '錯誤',
        description: `載入客戶訂單歷史失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
        variant: 'destructive',
      });
      setOrders([]); // 確保在錯誤時清空訂單列表
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

          <Separator />

          {/* 訂單歷史 */}
          <div>
            <h3 className="text-lg font-semibold mb-4">訂單歷史</h3>

            {loading ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                  <span>載入訂單歷史中...</span>
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <div className="text-muted-foreground mb-2">無訂單歷史記錄</div>
                <div className="text-sm text-muted-foreground">
                  該客戶電話 ({customer?.phone}) 尚未有訂單記錄
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground mb-3">
                  共 {orders.length} 筆訂單記錄
                </div>
                {orders.map((order, index) => (
                  <div key={`${order.id}-${index}`} className="border rounded-lg p-4 bg-muted/[0.2] hover:bg-muted/[0.3] transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="font-semibold">訂單 #{index + 1}</div>
                        {order.name && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                            {order.name}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(order.orderTime)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex items-start space-x-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-1" />
                        <span className="font-medium">購買項目：</span>
                        <span className="flex-1 text-foreground">{order.items || '無商品資訊'}</span>
                      </div>
                      {order.id && (
                        <div className="flex items-center space-x-2 mt-2 pt-2 border-t border-border/50">
                          <span className="text-xs text-muted-foreground">訂單ID:</span>
                          <span className="text-xs font-mono bg-muted px-2 py-1 rounded">{order.id}</span>
                        </div>
                      )}
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
