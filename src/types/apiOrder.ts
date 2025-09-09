import { OrderStatus, PaymentStatus } from './order';

// API 返回的原始訂單資料結構
export interface ApiOrder {
  id: string | number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: string; // API 返回的是字串，需要解析
  amount: string | number;
  status: string;
  createdAt: string;
  deliveryMethod: string;
  deliveryAddress: string;
  dueDate: string;
  deliveryTime: string;
  paymentMethod: string;
  note: string;
  paymentStatus: string;
}

// 將 API 訂單轉換為應用程式訂單的輔助函數
export function transformApiOrder(apiOrder: ApiOrder): import('./order').Order {
  // 解析商品項目
  let parsedItems: import('./order').OrderItem[] = [];
  if (apiOrder.items) {
    try {
      // 假設 items 是 JSON 字串或特定格式
      if (apiOrder.items.startsWith('[')) {
        parsedItems = JSON.parse(apiOrder.items);
      } else {
        // 處理其他格式，例如: "商品1 x2, 商品2 x1"
        const itemStrings = apiOrder.items.split(',');
        parsedItems = itemStrings.map(item => {
          const match = item.trim().match(/(.+)\s+x(\d+)/);
          if (match) {
            return {
              product: match[1],
              quantity: parseInt(match[2]),
              price: 0, // 需要從其他地方獲取價格
              subtotal: 0
            };
          }
          return {
            product: item.trim(),
            quantity: 1,
            price: 0,
            subtotal: 0
          };
        });
      }
    } catch (e) {
      console.error('Failed to parse items:', e);
    }
  }

  return {
    id: String(apiOrder.id),
    orderNumber: apiOrder.orderNumber,
    customer: {
      name: apiOrder.customerName,
      phone: apiOrder.customerPhone
    },
    items: parsedItems,
    total: typeof apiOrder.amount === 'string' ? parseFloat(apiOrder.amount) || 0 : apiOrder.amount,
    status: validateOrderStatus(apiOrder.status),
    createdAt: apiOrder.createdAt,
    deliveryMethod: apiOrder.deliveryMethod,
    deliveryAddress: apiOrder.deliveryAddress,
    dueDate: apiOrder.dueDate,
    deliveryTime: apiOrder.deliveryTime,
    paymentMethod: apiOrder.paymentMethod,
    notes: apiOrder.note,
    paymentStatus: validatePaymentStatus(apiOrder.paymentStatus || '')
  };
}

// 類型安全的狀態驗證函數
function validateOrderStatus(status: string): OrderStatus {
  const validStatuses: OrderStatus[] = ['訂單確認中', '已抄單', '已出貨', '取消訂單'];
  
  if (validStatuses.includes(status as OrderStatus)) {
    return status as OrderStatus;
  }
  
  // 預設值或映射邏輯
  console.warn(`Invalid order status: ${status}, using default '訂單確認中'`);
  return '訂單確認中';
}

// 類型安全的付款狀態驗證函數  
function validatePaymentStatus(status: string): PaymentStatus {
  const validPaymentStatuses: PaymentStatus[] = ['未收費', '已收費', '待轉帳', '未全款', '特殊', ''];
  
  if (validPaymentStatuses.includes(status as PaymentStatus)) {
    return status as PaymentStatus;
  }
  
  // 預設值或映射邏輯
  console.warn(`Invalid payment status: ${status}, using default '未收費'`);
  return '未收費';
}
