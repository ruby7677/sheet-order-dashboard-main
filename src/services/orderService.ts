import {mutateOrder,type MutationReceipt} from './orderMutations';
import { quoteCsvText } from '@/utils/csvSecurity';
import { parseCalendarDateKey } from '@/utils/deliveryPeriod';
import { Order, OrderStats, OrderItem } from '@/types/order';
import type { 
  SheetRowData, 
  OrdersPageResponse,
  DeleteOrderResponse,
  BatchDeleteOrdersResponse
} from '@/types/api';
// src/services/orderService.ts

// All environments use the same protected /api routes; Vite proxies these locally.
const apiCall = (endpoint: string, options: RequestInit = {}): Promise<Response> => {
  if (!endpoint.startsWith('/api/') || endpoint.includes('://')) throw new Error('無效的管理 API 路徑');
  return fetch(endpoint, {...options, credentials: 'same-origin', cache: 'no-store'});
};

/** Canonicalizes only supported full phone formats; invalid values never match. */
export const canonicalizePhone = (phone: string): string | null => {
  if (typeof phone !== 'string') return null;
  let value = phone.trim();
  if (value.startsWith("'")) value = value.slice(1);
  value = value.replace(/[\s\-()]/g, '');

  if (/^09\d{8}$/.test(value)) return `+886${value.slice(1)}`;
  const taiwanPhone = /^(?:\+886|886|00886)(9\d{8})$/.exec(value);
  if (taiwanPhone) return `+886${taiwanPhone[1]}`;
  // +886 is Taiwan's calling code. Reject malformed Taiwanese numbers here
  // instead of accidentally accepting them as generic international E.164.
  if (value.startsWith('+886')) return null;
  return /^\+[1-9]\d{1,14}$/.test(value) ? value : null;
};

// 快取機制 
interface OrderCache {
  timestamp: number;
  data: Order[];
  filters?: {
    status?: string;
    deliveryMethod?: string;
    search?: string;
    date?: string;
    paymentStatus?: string;
  };
}

let orderCache: OrderCache | null = null;
const CACHE_DURATION = 15000; // 快取有效期 15 秒，降低以提高即時性
const ORDERS_PAGE_SIZE = 500;
const MAX_ORDER_RECORDS = 20_000;
const MAX_ORDER_PAGES = MAX_ORDER_RECORDS / ORDERS_PAGE_SIZE;

class OrderPageExpiredError extends Error {}

async function fetchOrderPage(cursor: string | null): Promise<OrdersPageResponse> {
  const params = new URLSearchParams({ page_size: String(ORDERS_PAGE_SIZE) });
  if (cursor !== null) params.set('cursor', cursor);

  const response = await apiCall(`/api/orders?${params.toString()}`, { method: 'GET' });
  if (!response.ok) {
    let errorBody: { code?: string; message?: string } = {};
    try {
      errorBody = await response.json();
    } catch {
      // Preserve a safe status-based message when a response is not JSON.
    }
    if (response.status === 409 && errorBody.code === 'ORDER_PAGE_EXPIRED') {
      throw new OrderPageExpiredError('訂單資料快照已更新');
    }
    throw new Error(errorBody.message || `讀取訂單失敗（HTTP ${response.status}）`);
  }

  const result: OrdersPageResponse = await response.json();
  if (!result.success) throw new Error(result.message || '讀取訂單失敗');
  if (!Array.isArray(result.data)) throw new Error('訂單資料格式錯誤，請重新載入');
  if (!result.pagination) throw new Error('訂單分頁資訊缺失，無法確認資料完整性');
  return result;
}

async function collectOrderPages(): Promise<SheetRowData[]> {
  const rows: SheetRowData[] = [];
  const seenCursors = new Set<string>();
  const seenOrderIds = new Set<string>();
  let cursor: string | null = null;
  let snapshotRevision: string | null = null;
  let total: number | null = null;
  let pageSize: number | null = null;

  for (let pageNumber = 0; pageNumber < MAX_ORDER_PAGES; pageNumber += 1) {
    const result = await fetchOrderPage(cursor);
    const page = result.pagination!;

    if (!Number.isInteger(page.total) || page.total < 0) {
      throw new Error('訂單總筆數格式錯誤，無法確認資料完整性');
    }
    if (page.total > MAX_ORDER_RECORDS) {
      throw new Error('訂單總筆數超過安全載入上限（20,000 筆），請縮小查詢範圍或聯繫管理員。');
    }
    if (page.page_size !== ORDERS_PAGE_SIZE) {
      throw new Error('訂單分頁大小格式錯誤，無法確認資料完整性');
    }
    if (typeof page.snapshot_revision !== 'string' || !page.snapshot_revision) {
      throw new Error('訂單快照版本缺失，無法確認資料完整性');
    }
    if (page.next_cursor !== null && (typeof page.next_cursor !== 'string' || !page.next_cursor)) {
      throw new Error('訂單分頁游標格式錯誤，無法確認資料完整性');
    }
    if (result.data.length > page.page_size) {
      throw new Error('訂單頁面超出回應上限，無法確認資料完整性');
    }

    if (snapshotRevision === null) {
      snapshotRevision = page.snapshot_revision;
      total = page.total;
      pageSize = page.page_size;
    } else if (page.snapshot_revision !== snapshotRevision || page.total !== total || page.page_size !== pageSize) {
      throw new Error('訂單分頁快照不一致，請重新載入後再試');
    }

    for (const row of result.data) {
      const id = String(row.id || '');
      if (!id) throw new Error('訂單識別缺失，無法確認資料完整性');
      if (seenOrderIds.has(id)) throw new Error('訂單分頁包含重複識別，請重新載入後再試');
      seenOrderIds.add(id);
      rows.push(row);
    }

    if (rows.length > page.total) throw new Error('訂單分頁筆數超出總數，無法確認資料完整性');
    if (page.next_cursor === null) {
      if (rows.length !== page.total) throw new Error('訂單分頁未回傳完整資料，請重新載入後再試');
      return rows;
    }
    if (seenCursors.has(page.next_cursor)) throw new Error('訂單分頁游標重複，請重新載入後再試');
    if (rows.length >= page.total || result.data.length === 0) {
      throw new Error('訂單分頁游標與總筆數不一致，請重新載入後再試');
    }

    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }

  throw new Error('訂單分頁超過安全頁數上限（40 頁），請縮小查詢範圍或聯繫管理員。');
}

async function fetchCompleteOrderSnapshot(): Promise<SheetRowData[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await collectOrderPages();
    } catch (error) {
      if (!(error instanceof OrderPageExpiredError)) throw error;
      if (attempt === 1) throw new Error('訂單資料連續更新，請重新載入後再試。');
      // An expired cursor invalidates every row already collected. Restart once
      // from the first page; never return a partial mixture of snapshots.
    }
  }
  throw new Error('訂單資料無法載入，請重新載入後再試。');
}

// 直接從 Google Sheets API 取得訂單，不再使用 mockOrders
export const fetchOrders = async (filters?: {
  status?: string;
  deliveryMethod?: string;
  search?: string;
  date?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  paymentStatus?: string;
}, options?: { forceRefresh?: boolean }): Promise<Order[]> => {
  // 檢查是否有快取且未過期
  const now = Date.now();

  // 如果沒有進行搜尋或篩選，且有快取且未過期，直接使用快取資料
  if (
    orderCache && !options?.forceRefresh &&
    (now - orderCache.timestamp < CACHE_DURATION) &&
    (!filters || (!filters.status && !filters.deliveryMethod && !filters.search && !filters.date && !filters.paymentStatus))
  ) {
    console.log('使用快取的訂單資料');

    // 有過濾條件時，在前端篩選快取中的資料
    if (filters) {
      return filterOrdersInMemory(orderCache.data, filters);
    }

    return orderCache.data;
  }

  const rows = await fetchCompleteOrderSnapshot();

  // Sheets：將資料轉換成前端 Order 型別
  let orders: Order[] = rows.map((row: SheetRowData, idx: number) => {
    const createdAt = String(row.createdAt || row.訂單時間 || row[0] || new Date().toISOString().split('T')[0]);
    const id = String(row.id || `generated_id_${idx}`); // 提供預設ID以防萬一
    const orderNumber = String(row.orderNumber || `ORD-${Date.now()}-${idx}`); // 提供預設訂單號
    const customerName = String(row.customerName || row.customer?.name || row.姓名 || row[1] || '');
    const customerPhone = String(row.customerPhone || row.customer?.phone || row.電話 || row[2] || '');

    let itemsArray: { product: string; quantity: number; price: number; subtotal: number }[] = [];
    if (typeof row.items === 'string' && row.items.trim() !== '') {
      const raw = String(row.items).trim();
      itemsArray = raw.split(/[，,]/).map((itemStr: string) => {
        const parts = itemStr.trim().split(/\s*[xX×]\s*/);
        const product = parts[0] ? parts[0].trim() : '未知商品';
        const quantity = Number(parts[1]) || 1;
        let price = 0;
        // 自動對應單價（可依實際品項再擴充）
        if (product.includes('原味蘿蔔糕')) {price = 250;}
        else if (product.includes('芋頭粿')) {price = 350;}
        else if (product.includes('台式鹹蘿蔔糕')) {price = 350;}
        else if (product.includes('鳳梨豆腐乳')) {price = 300;}
        // 如果 Google Sheet 提供單價，則使用提供的單價（第三段）
        if (parts.length > 2 && parts[2] && !isNaN(Number(parts[2]))) {
          price = Number(parts[2]);
        }
        const safePrice = isNaN(price) || price < 0 ? 0 : price;
        const safeQty = isNaN(quantity) || quantity < 0 ? 0 : quantity;
        return {
          product,
          quantity: safeQty,
          price: safePrice,
          subtotal: safePrice * safeQty,
        };
      });
    } else if (Array.isArray(row.items)) {
      // 如果 items 已經是陣列格式 (雖然目前邏輯是字串，但增加彈性)
      itemsArray = row.items.map((item: { product?: string; quantity?: number; price?: number }) => {
        let price = Number(item.price);
        let quantity = Number(item.quantity);
        price = isNaN(price) || price < 0 ? 0 : price;
        quantity = isNaN(quantity) || quantity < 0 ? 0 : quantity;
        return {
          product: String(item.product || '未知商品'),
          quantity,
          price,
          subtotal: price * quantity,
        };
      });
    }

    // Delivery dates are calendar values, not instants; reject malformed dates without rollover.
    const formattedDueDate = parseCalendarDateKey(row.dueDate) ?? '';

    const unitPricesConfirmed = Array.isArray(row.priced_items) && row.priced_items.length > 0;

    return {
      unitPricesConfirmed,
      price_options: row.price_options,
      revision: row.revision, can_manage: row.can_manage, can_edit_items: row.can_edit_items, historical: row.historical, operation_pending: row.operation_pending,
      createdAt,
      id,
      orderNumber,
      customer: {
        name: customerName,
        phone: customerPhone
      },
      items: row.priced_items || itemsArray.map(i=>({...i,price:0,subtotal:0})),
      total: (!isNaN(Number(row.amount)) && Number(row.amount) > 0)
        ? Number(row.amount)
        : itemsArray.reduce((sum, i) => sum + i.subtotal, 0),
      dueDate: formattedDueDate,
      deliveryTime: String(row.deliveryTime || ''),
      notes: String(row.note || row.customer?.note || row.note || row.備註 || ''),
      status: String(row.status || '訂單確認中') as Order['status'], // 提供預設狀態
      deliveryMethod: String(row.deliveryMethod || ''),
      deliveryAddress: String(row.deliveryAddress || ''),
      paymentMethod: String(row.paymentMethod || ''),
      paymentStatus: String(row.paymentStatus || row['paymentStatus'] || row['款項'] || '') as Order['paymentStatus']
    };
  });

  // 更新快取
  orderCache = {
    timestamp: Date.now(),
    data: orders,
    filters: filters ? { ...filters } : undefined
  };

  // 有過濾條件時前端進行過濾
  if (filters) {
    orders = filterOrdersInMemory(orders, filters);
  }

  return orders;
};

// 在記憶體中過濾訂單資料的函數
const filterOrdersInMemory = (orders: Order[], filters: {
  status?: string;
  deliveryMethod?: string;
  search?: string;
  date?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  paymentStatus?: string;
}): Order[] => {
  let filteredOrders = [...orders];

  if (filters.status && filters.status !== '所有狀態') {
    filteredOrders = filteredOrders.filter(order => order.status === filters.status);
  }

  // 配送方式篩選
  if (filters.deliveryMethod && filters.deliveryMethod !== '所有配送方式') {
    filteredOrders = filteredOrders.filter(order => order.deliveryMethod === filters.deliveryMethod);
  }

  if (filters.search) {
    const rawSearch = String(filters.search).trim();
    const searchTerm = rawSearch.toLowerCase();
    const canonicalPhoneSearch = canonicalizePhone(rawSearch);
    filteredOrders = filteredOrders.filter(
      order =>
        (order.orderNumber && order.orderNumber.toLowerCase().includes(searchTerm)) ||
        (order.customer.name && order.customer.name.toLowerCase().includes(searchTerm)) ||
        (order.customer.phone && order.customer.phone.toLowerCase().includes(searchTerm)) ||
        (canonicalPhoneSearch !== null && canonicalizePhone(order.customer.phone) === canonicalPhoneSearch)
    );
  }

  // 到貨日期篩選 - 支援日期區間和單一日期（向後兼容）
  if (filters.dateRange || filters.date) {
    // Prefer the explicit range; keep the legacy single-date filter as a lower bound.
    const startText = filters.dateRange ? filters.dateRange.startDate : filters.date;
    const endText = filters.dateRange?.endDate;
    const hasStart = typeof startText === 'string' && startText !== '';
    const hasEnd = typeof endText === 'string' && endText !== '';
    const startDate = hasStart ? parseCalendarDateKey(startText) : null;
    const endDate = hasEnd ? parseCalendarDateKey(endText) : null;

    // Malformed bounds fail closed; empty ranges preserve the unfiltered list.
    if (
      (hasStart && !startDate)
      || (hasEnd && !endDate)
      || (startDate && endDate && startDate > endDate)
    ) {
      filteredOrders = [];
    } else if (startDate || endDate) {
      filteredOrders = filteredOrders.filter(order => {
        const orderDueDate = parseCalendarDateKey(order.dueDate);
        if (!orderDueDate) return false;
        if (startDate && orderDueDate < startDate) return false;
        if (endDate && orderDueDate > endDate) return false;
        return true;
      });
    }
  }

  // 付款狀態篩選
  if (filters.paymentStatus && filters.paymentStatus !== '所有付款狀態') {
    filteredOrders = filteredOrders.filter(order => order.paymentStatus === filters.paymentStatus);
  }

  return filteredOrders;
};

export const fetchOrderById = async (id: string): Promise<Order | null> => {
  const orders = await fetchOrders();
  return orders.find(order => order.id === id) || null;
};

// 清除訂單快取，強制重新從服務器獲取最新數據
export const clearOrderCache = () => {
  orderCache = null;
};

export const fetchOrderStats = async (): Promise<OrderStats> => {
  const orders = await fetchOrders();

  // 計算未收費訂單數量（款項狀態為空、未收費或未全款）
  const unpaidOrders = orders.filter(order =>
    !order.paymentStatus ||
    order.paymentStatus === '未收費' ||
    order.paymentStatus === '未全款'
  );

  // 計算所有訂單總金額
  const totalAmount = orders.reduce((sum, order) => sum + (order.total || 0), 0);

  // 計算各商品總數量
  let totalRadishCake = 0;
  let totalTaroCake = 0;
  let totalHKRadishCake = 0;
  let totaltest = 0;

  orders.forEach(order => {
    order.items.forEach(item => {
      if (item.product.includes('原味蘿蔔糕')) {
        totalRadishCake += item.quantity;
      } else if (item.product.includes('芋頭粿')) {
        totalTaroCake += item.quantity;
      } else if (item.product.includes('台式鹹蘿蔔糕')) {
        totalHKRadishCake += item.quantity;
      } else if (item.product.includes('鳳梨豆腐乳')) {
        totaltest += item.quantity;
      }
    });
  });

  return {
    total: orders.length,
    pending: orders.filter(order => order.status === '訂單確認中').length,
    processing: orders.filter(order => order.status === '已抄單').length,
    completed: orders.filter(order => order.status === '已出貨').length,
    canceled: orders.filter(order => order.status === '取消訂單').length,
    unpaid: unpaidOrders.length,
    totalAmount: totalAmount,
    totalRadishCake,
    totalTaroCake,
    totalHKRadishCake,
    totaltest
  };
};

// 注意：Google Sheets API 不支援直接修改資料，若需更新請自行設計後端 API 處理
export const updateOrderStatus = (id:string,status:Order['status'],revision?:string):Promise<MutationReceipt> => mutateOrder(id,revision,{kind:'status',status}).then(result=>{clearOrderCache();return result;});

// 批次更新訂單狀態
export const batchUpdateOrderStatus = async (ids:string[],status:Order['status'],snapshots:Order[]=[]):Promise<BatchDeleteOrdersResponse> => {const results:BatchDeleteOrdersResponse['results']=[];for(const id of ids){try{const r=await updateOrderStatus(id,status,snapshots.find(o=>o.id===id)?.revision);results.push({id,success:true,message:r.warning||'已更新'});}catch(e){results.push({id,success:false,message:e instanceof Error?e.message:'結果尚待確認'});}}return {success:true,results,totalDeleted:results.filter(r=>r.success).length,totalFailed:results.filter(r=>!r.success).length};};

// 批次更新款項狀態
export const updateOrderPaymentStatus = (id:string,status:string,revision?:string):Promise<MutationReceipt> => mutateOrder(id,revision,{kind:'payment',status}).then(result=>{clearOrderCache();return result;});

export const batchUpdateOrderPaymentStatus = async (ids:string[],status:string,snapshots:Order[]=[]):Promise<BatchDeleteOrdersResponse> => {const results:BatchDeleteOrdersResponse['results']=[];for(const id of ids){try{await updateOrderPaymentStatus(id,status,snapshots.find(o=>o.id===id)?.revision);results.push({id,success:true,message:'已更新'});}catch(e){results.push({id,success:false,message:e instanceof Error?e.message:'結果尚待確認'});}}return {success:true,results,totalDeleted:results.filter(r=>r.success).length,totalFailed:results.filter(r=>!r.success).length};};

// 更新訂單商品
export const updateOrderItems = (id:string,items:OrderItem[],_quotedTotal:number,revision?:string):Promise<MutationReceipt> => {if(items.some(i=>!i.product_id))return Promise.reject(new Error('請先確認商品識別與成交單價'));return mutateOrder(id,revision,{kind:'items',items:items.map(i=>({product_id:i.product_id,quantity:i.quantity}))}).then(result=>{clearOrderCache();return result;});};

// 刪除訂單
export const deleteOrder = (id:string,revision?:string):Promise<MutationReceipt> => mutateOrder(id,revision,{kind:'delete'}).then(result=>{clearOrderCache();return result;});

// 批次刪除訂單
export const batchDeleteOrders = async (ids:string[],snapshots:Order[]=[]):Promise<BatchDeleteOrdersResponse> => {const results:BatchDeleteOrdersResponse['results']=[];for(const id of ids){try{const response=await deleteOrder(id,snapshots.find(o=>o.id===id)?.revision);results.push({id,success:true,message:response.warning||response.message||'已刪除'});}catch(error){results.push({id,success:false,message:error instanceof Error?error.message:'結果尚待確認'});}}clearOrderCache();return {success:true,results,totalDeleted:results.filter(r=>r.success).length,totalFailed:results.filter(r=>!r.success).length};};

// 重複訂單檢測相關類型定義
export interface DuplicateOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  normalizedPhone: string; // 標準化後的電話號碼（用於比對）
}

export interface DuplicateGroup {
  phone: string; // 顯示用的電話號碼
  normalizedPhone: string; // 標準化後的電話號碼
  orders: DuplicateOrder[];
  count: number;
}

// 檢測重複訂單
export const detectDuplicateOrders = (orders: Order[]): DuplicateGroup[] => {
  // 按標準化電話號碼分組
  const phoneGroups = new Map<string, DuplicateOrder[]>();

  orders.forEach(order => {
    const normalizedPhone = canonicalizePhone(order.customer.phone);
    if (!normalizedPhone) {return;} // Invalid numbers must never be merged by a suffix.

    const duplicateOrder: DuplicateOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      normalizedPhone
    };

    if (!phoneGroups.has(normalizedPhone)) {
      phoneGroups.set(normalizedPhone, []);
    }
    phoneGroups.get(normalizedPhone)!.push(duplicateOrder);
  });

  // 只返回有重複的群組（訂單數量 > 1）
  const duplicateGroups: DuplicateGroup[] = [];
  phoneGroups.forEach((orders, normalizedPhone) => {
    if (orders.length > 1) {
      duplicateGroups.push({
        phone: orders[0].customerPhone, // 使用第一個訂單的原始電話號碼作為顯示
        normalizedPhone,
        orders,
        count: orders.length
      });
    }
  });

  // 按重複數量降序排列
  return duplicateGroups.sort((a, b) => b.count - a.count);
};

// 檢查單個訂單是否為重複訂單
export const isOrderDuplicate = (order: Order, allOrders: Order[]): boolean => {
  const normalizedPhone = canonicalizePhone(order.customer.phone);
  if (!normalizedPhone) {return false;}

  // 計算有相同標準化電話號碼的訂單數量
  const samePhoneOrders = allOrders.filter(o =>
    canonicalizePhone(o.customer.phone) === normalizedPhone
  );

  return samePhoneOrders.length > 1;
};

export const generatePrintData = (orders: Order[]): {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: string;
  total: number;
  deliveryMethod: string;
  deliveryAddress: string;
  dueDate: string;
  deliveryTime: string;
  paymentMethod: string;
  notes: string;
}[] => {
  // Transform orders into print format
  return orders.map(order => ({
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    customerPhone: order.customer.phone,
    items: order.items.map(item => `${item.product} x ${item.quantity}`).join(', '),
    total: order.total,
    deliveryMethod: order.deliveryMethod,
    deliveryAddress: order.deliveryAddress,
    dueDate: order.dueDate,
    deliveryTime: order.deliveryTime,
    paymentMethod: order.paymentMethod,
    notes: order.notes
  }));
};

export const exportToCsv = (orders: Order[]): string => {
  // 黑貓宅急便格式標題
  /*const headers = [
    '訂單編號',
    '溫層',
    '規格',
    '代收貨款',
    '收件人-姓名',
    '收件人-電話',
    '收件人-地址',
    '寄件人-姓名',
    '寄件人-電話',
    '寄件人-地址',
    '出貨日期',
    '希望配達日',
    '希望配合時段',
    '品類代碼',
    '品名',
    '易碎物品',
    '備註'
  ].join(',');*/

  // 固定寄件人資訊
  const senderName = '曾炳傑';
  const senderPhone = '0937292815';
  const senderAddress = '雲林縣西螺鎮中山路302-3號';

  // 去除特殊符號工具
  const removeSpecialChars = (str: string) => str.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
  // 只保留 09 開頭的電話
  const formatPhone = (phone: string) => /^09\d{8}$/.test(phone) ? `'${phone}` : '';
  // CSV欄位格式化工具，處理包含逗號、引號、換行的內容
  const formatCsvField = quoteCsvText;

  const today = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const todayStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;

  // 依勾選順序自動產生訂單編號（A001~A100）
  const genOrderNumber = (idx: number) => `A${(idx + 1).toString().padStart(3, '0')}`;

  const rows = orders.map((order, idx) => {
    // 希望配達日格式化（假設 order.dueDate 是 yyyy-mm-dd 或 yyyy/mm/dd 或 Date 物件）
    let wishDate = '';
    if (order.dueDate) {
      const d = typeof order.dueDate === 'string' ? new Date(order.dueDate.replace(/-/g, '/')) : order.dueDate;
      if (!isNaN(d.getTime())) {
        // 檢查希望配達日是否在出貨日之前，如果是則設為出貨日+1
        if (d <= today) {
          const nextDay = new Date(today);
          nextDay.setDate(today.getDate() + 1);
          wishDate = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;
        } else {
          wishDate = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        }
      }
    }
    // 如果沒有希望配達日，預設為出貨日+1
    if (!wishDate) {
      const nextDay = new Date(today);
      nextDay.setDate(today.getDate() + 1);
      wishDate = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;
    }
    // 希望配合時段
    let wishTime = '';
    if (order.deliveryTime) {
      if (order.deliveryTime.includes('上')) {wishTime = '1';}
      else if (order.deliveryTime.includes('下')) {wishTime = '2';}
    }
    return [
      genOrderNumber(idx), // 依序產生A001~A100訂單編號
      '2',               // 溫層（固定）
      '0',               // 規格（固定）
      order.paymentStatus === '已收費' ? '0' : (order.paymentMethod === '貨到付款' ? order.total : '0'), // 代收貨款
      removeSpecialChars(order.customer.name || ''),          // 收件人-姓名
      formatPhone(order.customer.phone || ''),                // 收件人-電話
      formatCsvField(order.deliveryAddress || ''),            // 收件人-地址
      senderName,       // 寄件人-姓名
      `'${senderPhone}`, // 寄件人-電話（強制文字格式）
      senderAddress,    // 寄件人-地址
      todayStr,         // 出貨日期
      wishDate,         // 希望配達日
      wishTime,         // 希望配合時段
      '0015',           // 品類代碼（固定）
      '蘿蔔糕',          // 品名（固定）
      'Y',              // 易碎物品（固定）
      formatCsvField(order.notes || '')                       // 備註
    ].join(',');
  });

  // 使用標準的Unicode (UTF-8)格式
  // 1. 不使用BOM標記，採用純UTF-8編碼
  // 2. 使用Windows標準的CRLF換行符
  // 3. 確保所有中文字符正確編碼
  //const BOM = '\uFEFF';
  const csvContent = rows.join('\r\n');//[headers, ...rows].join('\r\n');

  // 返回完整的CSV內容，包含BOM
  return  csvContent;//BOM +csvContent;
};

export const initializeOrderPricing = (id:string,revision:string|undefined,prices:Array<{product:string;product_id:string;unit_price:number}>,shipping:number,reason:string)=>mutateOrder(id,revision,{kind:'pricing',prices,shipping,reason}).then(result=>{clearOrderCache();return result;});
