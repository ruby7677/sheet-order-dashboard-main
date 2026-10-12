// API 相關類型定義

// API 基本回應格式
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface OrderPagination {
  next_cursor: string | null;
  total: number;
  page_size: number;
  snapshot_revision: string;
}

export interface OrdersPageResponse extends ApiResponse<SheetRowData[]> {
  pagination?: OrderPagination;
  code?: string;
}

// Google Sheets API 原始資料格式
export interface SheetRowData {
  // 基本訂單資訊
  createdAt?: string;
  id?: string;
  revision?: string;
  priced_items?: Array<{product_id:string;product:string;quantity:number;price:number;subtotal:number}> | null;
  can_manage?: boolean;
  can_edit_items?: boolean;
  historical?: boolean;
  operation_pending?: boolean;
  price_options?: Array<{product_id:string;name:string;price:number}>;
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
  
  // 中文欄位名稱支援
  備註?: string;
  訂單時間?: string;
  款項?: string;
  姓名?: string;
  電話?: string;
  
  // 支援陣列索引存取
  [index: number]: unknown;
  
  // 客戶物件（某些情況下可能存在）
  customer?: {
    name?: string;
    phone?: string;
    note?: string;
  };
}

// API 錯誤類型
export interface ApiError {
  message: string;
  code?: string | number;
  details?: unknown;
}

// 刪除訂單回應格式
export interface DeleteOrderResponse {
  reorder_result?: { success: boolean; message?: string; updated_rows: number };
  success: boolean;
  message?: string;
  orderNumber?: string;
  reorderInfo?: {
    movedOrders: Array<{
      id: string;
      oldPosition: number;
      newPosition: number;
    }>;
  };
}

// 批次刪除回應格式
export interface BatchDeleteOrdersResponse {
  success: boolean;
  results: Array<{
    id: string;
    success: boolean;
    message: string;
    orderNumber?: string;
  }>;
  totalDeleted: number;
  totalFailed: number;
  message?: string;
}
