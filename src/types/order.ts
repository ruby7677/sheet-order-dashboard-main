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

/**
 * 後端 API 回傳的原始訂單資料結構
 * 包含英文欄位、繁中欄位及可能的巢狀 customer 物件
 */
export interface RawOrderRow {
  // 主要英文欄位
  createdAt?: string;
  id?: string;
  orderNumber?: string;
  customerName?: string;
  customerPhone?: string;
  items?: string | Array<{product: string; quantity: number; price: number}>;
  amount?: number;
  dueDate?: string;
  deliveryTime?: string;
  note?: string;
  status?: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  
  // 繁中欄位（對應 Google Sheets 欄位名稱）
  備註?: string;
  訂單時間?: string;
  款項?: string;
  姓名?: string;
  電話?: string;
  宅配方式?: string;
  門市或地址?: string;
  希望到貨日?: string;
  宅配時段?: string;
  訂單項目?: string;
  總金額?: string;
  社交軟體名字?: string;
  付款方式?: string;
  Id?: string;
  
  // 巢狀 customer 物件（某些資料來源可能包含）
  customer?: {
    name?: string;
    phone?: string;
    note?: string;
  };
  
  // 陣列索引存取（對應 Google Sheets 的欄位索引）
  [index: number]: unknown;
}

/**
 * 刪除訂單 API 的回應結構
 */
export interface DeleteOrderResponse {
  success: boolean;
  message?: string;
  reorder_result?: {
    success: boolean;
    updated_rows: number;
  };
}

export type DeliveryMethod = '7-11門市' | '宅配到府' | '門市取貨';
export type OrderStatus = '訂單確認中' | '已抄單' | '已出貨' | '取消訂單';
export type PaymentMethod = '貨到付款' | '銀行轉帳';
