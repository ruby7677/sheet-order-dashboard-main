export interface OrderItem {
  product: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export type PaymentStatus = '未收費' | '已收費' | '待轉帳' | '未全款' | '特殊' | '';

export interface Order {
  id: string;
  orderNumber: string;
  customer: {
    name: string;
    phone: string;
  };
  items: OrderItem[];
  total: number;
  status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單';
  createdAt: string;
  deliveryMethod: string;
  deliveryAddress: string;
  dueDate: string;
  deliveryTime: string;
  paymentMethod: string;
  notes: string;
  paymentStatus?: PaymentStatus;
}

export interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  canceled: number;
  unpaid: number; // 未收費訂單數量
  totalAmount: number; // 所有訂單總金額
  totalRadishCake: number; // 原味蘿蔔糕總數量
  totalTaroCake: number; // 芋頭粿總數量
  totalHKRadishCake: number; // 台式鹹蘿蔔糕總數量
  totaltest: number; // 鳳梨豆腐乳總數量
}

export type DeliveryMethod = '7-11門市' | '宅配到府' | '門市取貨';
export type OrderStatus = '訂單確認中' | '已抄單' | '已出貨' | '取消訂單';
export type PaymentMethod = '貨到付款' | '銀行轉帳';
