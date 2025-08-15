import { Order, OrderStats, OrderItem } from '@/types/order';
// src/services/orderService.ts

// 動態 API 配置系統
const getApiConfig = () => {
  const hostname = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol;
  
  // 檢查是否在 Cloudflare Pages 環境
  const isCloudflarePages = hostname.includes('.pages.dev') || 
                           hostname.includes('lopokao.767780.xyz') ||
                           hostname.includes('node.767780.xyz');
  
  // 本地開發環境
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  
  console.log('🌍 環境檢測:', {
    hostname,
    port,
    protocol,
    isCloudflarePages,
    isLocalDev
  });
  
  return {
    isLocalDev,
    isCloudflarePages,
    // Workers API 端點 (生產環境)
    workersApiUrl: 'https://sheet-order-api.ruby7677.workers.dev',
    // 本地 Workers API (開發時)
    localWorkersApiUrl: 'http://127.0.0.1:5714',
    // 傳統 PHP API (後備方案)
    legacyApiBase: isLocalDev && port === '8080' 
      ? '/sheet-order-dashboard-main/api' 
      : '/api'
  };
};

// 根據環境動態選擇 API 端點
const getApiEndpoint = (endpoint: string) => {
  const config = getApiConfig();
  
  // 優先嘗試 Workers API
  if (config.isCloudflarePages || !config.isLocalDev) {
    // 生產環境或 Cloudflare Pages: 使用生產 Workers API
    return `${config.workersApiUrl}${endpoint}`;
  } else if (config.isLocalDev) {
    // 本地開發: 嘗試本地 Workers API，失敗則降級到傳統 API
    return `${config.localWorkersApiUrl}${endpoint}`;
  }
  
  // 後備方案: 傳統 PHP API
  return `${config.legacyApiBase}${endpoint}`;
};

// 建立一個錯誤處理和重試機制
const apiCallWithFallback = async (endpoint: string, options: RequestInit = {}) => {
  const config = getApiConfig();
  let lastError: Error | null = null;
  
  // 嘗試順序: Workers API -> 傳統 API
  const endpoints = [];
  
  if (config.isCloudflarePages || !config.isLocalDev) {
    endpoints.push(`${config.workersApiUrl}${endpoint}`);
  } else if (config.isLocalDev) {
    endpoints.push(`${config.localWorkersApiUrl}${endpoint}`);
    endpoints.push(`${config.legacyApiBase}${endpoint}`);
  } else {
    endpoints.push(`${config.legacyApiBase}${endpoint}`);
  }
  
  console.log('🔗 API 嘗試順序:', endpoints);
  
  for (const apiUrl of endpoints) {
    try {
      console.log('📡 嘗試 API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        ...options,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          ...options.headers
        }
      });
      
      if (response.ok) {
        console.log('✅ API 成功:', apiUrl);
        return response;
      } else {
        console.log('❌ API 失敗:', apiUrl, response.status, response.statusText);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.log('❌ API 錯誤:', apiUrl, error);
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  
  // 所有端點都失敗
  throw lastError || new Error('所有 API 端點都無法連接');
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

// 直接從 Google Sheets API 取得訂單，不再使用 mockOrders
export const fetchOrders = async (filters?: {
  status?: string;
  deliveryMethod?: string;
  search?: string;
  date?: string;
  paymentStatus?: string;
}): Promise<Order[]> => {
  // 檢查是否有快取且未過期
  const now = Date.now();

  // 如果沒有進行搜尋或篩選，且有快取且未過期，直接使用快取資料
  if (
    orderCache &&
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

  // 使用新的 API 重試機制
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);
  
  // 構建 API 端點和參數 - 改用 Supabase 端點
  const endpoint = '/orders';
  const params = new URLSearchParams({
    refresh: '1',
    _: timestamp.toString(),
    nonce: nonce,
    v: '1.2' // API 版本號
  });
  
  const fullEndpoint = `${endpoint}?${params.toString()}`;
  
  // 使用錯誤處理和重試機制
  const res = await apiCallWithFallback(fullEndpoint, {
    method: 'GET'
  });
  if (!res.ok) {
    // 如果 HTTP 狀態碼不是 2xx，嘗試讀取錯誤訊息
    let errorMsg = '讀取訂單失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      // 如果回應不是 JSON 或其他錯誤，使用 res.statusText
      errorMsg = `讀取訂單失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }

  const result = await res.json();
  if (!result.success) throw new Error(result.message || '讀取訂單失敗');
  if (!result.data || !Array.isArray(result.data)) {
    console.warn('API回傳的訂單資料格式不正確，應為陣列:', result.data);
    return []; // 或者拋出錯誤，視情況而定
  }

  // 將 Google Sheets 資料轉換成前端 Order 型別
  let orders = result.data.map((row: {
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
    備註?: string;
    訂單時間?: string;
    款項?: string;
  }, idx: number) => {
    const createdAt = String(row['createdAt'] || row['訂單時間'] || row[0] || new Date().toISOString().split('T')[0]);
    const id = String(row.id || `generated_id_${idx}`); // 提供預設ID以防萬一
    const orderNumber = String(row.orderNumber || `ORD-${Date.now()}-${idx}`); // 提供預設訂單號
    const customerName = String(row.customerName || (row as any).customer?.name || row['姓名'] || row[1] || '');
    const customerPhone = String(row.customerPhone || (row as any).customer?.phone || row['電話'] || row[2] || '');

    let itemsArray: { product: string; quantity: number; price: number; subtotal: number }[] = [];
    if (typeof row.items === 'string' && row.items.trim() !== '') {
      const raw = String(row.items).trim();
      itemsArray = raw.split(/[，,]/).map((itemStr: string) => {
        const parts = itemStr.trim().split(/\s*[xX×]\s*/);
        const product = parts[0] ? parts[0].trim() : '未知商品';
        const quantity = Number(parts[1]) || 1;
        let price = 0;
        // 自動對應單價（可依實際品項再擴充）
        if (product.includes('原味蘿蔔糕')) price = 250;
        else if (product.includes('芋頭粿')) price = 350;
        else if (product.includes('台式鹹蘿蔔糕')) price = 350;
        else if (product.includes('鳳梨豆腐乳')) price = 300;
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

    // 嘗試將各種日期格式轉換為 YYYY-MM-DD
    let formattedDueDate = '';
    if (row.dueDate) {
      try {
        const dateObj = new Date(String(row.dueDate).replace(/-/g, '/'));
        if (!isNaN(dateObj.getTime())) {
          const year = dateObj.getFullYear();
          const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
          const day = dateObj.getDate().toString().padStart(2, '0');
          formattedDueDate = `${year}-${month}-${day}`;
        }
      } catch (e) {
        console.warn(`無法解析日期: ${row.dueDate}`);
      }
    }

    return {
      createdAt,
      id,
      orderNumber,
      customer: {
        name: customerName,
        phone: customerPhone
      },
      items: itemsArray,
      total: (!isNaN(Number(row.amount)) && Number(row.amount) > 0)
        ? Number(row.amount)
        : itemsArray.reduce((sum, i) => sum + i.subtotal, 0),
      dueDate: formattedDueDate,
      deliveryTime: String(row.deliveryTime || ''),
      notes: String(row.note || (row as any).customer?.note || row['note'] || row['備註'] || ''),
      status: String(row.status || '訂單確認中'), // 提供預設狀態
      deliveryMethod: String(row.deliveryMethod || ''),
      deliveryAddress: String(row.deliveryAddress || ''),
      paymentMethod: String(row.paymentMethod || ''),
      paymentStatus: String(row.paymentStatus || row['paymentStatus'] || row['款項'] || '')
    };
  });

  // 更新快取
  orderCache = {
    timestamp: now,
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
    const searchTerm = String(filters.search).toLowerCase();
    filteredOrders = filteredOrders.filter(
      order =>
        (order.orderNumber && order.orderNumber.toLowerCase().includes(searchTerm)) ||
        (order.customer.name && order.customer.name.toLowerCase().includes(searchTerm)) ||
        (order.customer.phone && order.customer.phone.includes(searchTerm))
    );
  }

  // 到貨日期篩選 - 支援日期區間和單一日期（向後兼容）
  if (filters.dateRange || filters.date) {
    try {
      let startDateFilter: Date | undefined;
      let endDateFilter: Date | undefined;

      // 優先使用日期區間，如果沒有則使用單一日期（向後兼容）
      if (filters.dateRange) {
        if (filters.dateRange.startDate) {
          startDateFilter = new Date(filters.dateRange.startDate);
          startDateFilter.setHours(0, 0, 0, 0);
        }
        if (filters.dateRange.endDate) {
          endDateFilter = new Date(filters.dateRange.endDate);
          endDateFilter.setHours(23, 59, 59, 999); // 結束日期設為當天最後一刻
        }
      } else if (filters.date) {
        // 向後兼容：單一日期篩選（選擇日期或之後的訂單）
        startDateFilter = new Date(filters.date);
        startDateFilter.setHours(0, 0, 0, 0);
      }

      if (startDateFilter || endDateFilter) {
        filteredOrders = filteredOrders.filter(order => {
          if (!order.dueDate) return false; // 如果訂單沒有到貨日期，則不符合條件

          try {
            const orderDueDate = new Date(order.dueDate);
            orderDueDate.setHours(0, 0, 0, 0);

            if (isNaN(orderDueDate.getTime())) return false;

            // 檢查開始日期條件
            if (startDateFilter && !isNaN(startDateFilter.getTime())) {
              if (orderDueDate.getTime() < startDateFilter.getTime()) {
                return false;
              }
            }

            // 檢查結束日期條件
            if (endDateFilter && !isNaN(endDateFilter.getTime())) {
              if (orderDueDate.getTime() > endDateFilter.getTime()) {
                return false;
              }
            }

            return true;
          } catch (e) {
            console.warn(`過濾時無法解析訂單到貨日期: ${order.dueDate}`);
            return false;
          }
        });
      }
    } catch (e) {
      console.warn(`過濾時無法解析篩選日期:`, e);
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
export const updateOrderStatus = async (id: string, status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'): Promise<void> => {
  // 添加時間戳和隨機數，確保每次請求都是唯一的
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 構建 API 端點和參數
  const params = new URLSearchParams({
    _: timestamp.toString(),
    nonce: nonce
  });
  
  const endpoint = `/orders/status?${params.toString()}`;

  const res = await apiCallWithFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, status, timestamp, nonce }),
  });
  if (!res.ok) {
    let errorMsg = '更新訂單狀態失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      errorMsg = `更新訂單狀態失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }
  const result = await res.json();
  if (!result.success) throw new Error(result.message || '更新訂單狀態失敗');

  // 成功更新後清除快取
  clearOrderCache();
};

// 批次更新訂單狀態
export const batchUpdateOrderStatus = async (ids: string[], status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'): Promise<void> => {
  // 使用 Promise.all 實現併發請求，提高批次處理效率
  try {
    await Promise.all(ids.map(id => updateOrderStatus(id, status)));

    // 批次操作成功後清除快取
    clearOrderCache();
  } catch (error) {
    console.error('批次更新訂單狀態失敗:', error);
    throw error;
  }
};

// 批次更新款項狀態
export const updateOrderPaymentStatus = async (id: string, paymentStatus: string): Promise<void> => {
  // 添加時間戳和隨機數，確保每次請求都是唯一的
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 使用新的 Supabase API 端點
  const workersEndpoint = '/orders/payment';
  const legacyEndpoint = `/api/update_payment_status.php?_=${timestamp}&nonce=${nonce}`;
  
  // 優先嘗試 Workers API
  let res;
  try {
    res = await apiCallWithFallback(workersEndpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, status: paymentStatus }),
    });
  } catch (workersError) {
    console.log('Workers API 失敗，嘗試 PHP API:', workersError);
    // Fallback 到 PHP API
    res = await apiCallWithFallback(legacyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id, paymentStatus, timestamp, nonce }),
    });
  }
  
  if (!res.ok) {
    let errorMsg = '更新款項狀態失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      errorMsg = `更新款項狀態失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }
  const result = await res.json();
  if (!result.success) throw new Error(result.message || '更新款項狀態失敗');

  // 成功更新後清除快取
  clearOrderCache();
};

export const batchUpdateOrderPaymentStatus = async (ids: string[], paymentStatus: string): Promise<void> => {
  // 使用 Promise.all 實現併發請求，提高批次處理效率
  try {
    await Promise.all(ids.map(id => updateOrderPaymentStatus(id, paymentStatus)));

    // 批次操作成功後清除快取
    clearOrderCache();
  } catch (error) {
    console.error('批次更新款項狀態失敗:', error);
    throw error;
  }
};

// 更新訂單商品
export const updateOrderItems = async (id: string, items: OrderItem[], total: number): Promise<void> => {
  // 添加時間戳和隨機數，確保每次請求都是唯一的
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 構建 API 端點和參數
  const params = new URLSearchParams({
    _: timestamp.toString(),
    nonce: nonce
  });
  
  const endpoint = `/orders/items?${params.toString()}`;

  const res = await apiCallWithFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, items, total, timestamp, nonce }),
  });

  if (!res.ok) {
    let errorMsg = '更新訂單商品失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      errorMsg = `更新訂單商品失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }

  const result = await res.json();
  if (!result.success) throw new Error(result.message || '更新訂單商品失敗');

  // 成功更新後清除快取
  clearOrderCache();
};

// 刪除訂單
export const deleteOrder = async (id: string): Promise<any> => {
  // 添加時間戳和隨機數，確保每次請求都是唯一的
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 構建 API 端點和參數
  const params = new URLSearchParams({
    _: timestamp.toString(),
    nonce: nonce
  });
  
  const endpoint = `/orders/delete?${params.toString()}`;

  // 處理刪除訂單的邏輯
  const res = await apiCallWithFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id, timestamp, nonce }),
  });
  if (!res.ok) {
    let errorMsg = '刪除訂單失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      errorMsg = `刪除訂單失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }
  const result = await res.json();
  if (!result.success) throw new Error(result.message || '刪除訂單失敗');

  // 成功刪除後清除快取
  clearOrderCache();

  // 返回完整的結果，包含重排序信息
  return result;
};

// 批次刪除訂單
export const batchDeleteOrders = async (ids: string[]): Promise<{
  success: boolean;
  results: Array<{
    id: string;
    success: boolean;
    message: string;
    orderNumber?: string;
  }>;
  totalDeleted: number;
  totalFailed: number;
}> => {
  // 添加時間戳和隨機數，確保每次請求都是唯一的
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 構建 API 端點和參數
  const params = new URLSearchParams({
    _: timestamp.toString(),
    nonce: nonce
  });
  
  const endpoint = `/orders/batch-delete?${params.toString()}`;

  // 處理批次刪除訂單的邏輯
  const res = await apiCallWithFallback(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids, timestamp, nonce }),
  });

  if (!res.ok) {
    let errorMsg = '批次刪除訂單失敗';
    try {
      const errorResult = await res.json();
      errorMsg = errorResult.message || errorMsg;
    } catch (e) {
      errorMsg = `批次刪除訂單失敗: ${res.statusText}`;
    }
    throw new Error(errorMsg);
  }

  const result = await res.json();
  if (!result.success) throw new Error(result.message || '批次刪除訂單失敗');

  // 成功刪除後清除快取
  clearOrderCache();

  // 返回完整的結果
  return result;
};

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

// 標準化電話號碼（只保留數字，取後9碼）
const normalizePhone = (phone: string): string => {
  if (!phone) return '';
  // 移除所有非數字字符
  const digitsOnly = phone.replace(/[^0-9]/g, '');
  // 取後9碼進行比較（如果電話號碼長度大於9）
  return digitsOnly.length >= 9 ? digitsOnly.slice(-9) : digitsOnly;
};

// 檢測重複訂單
export const detectDuplicateOrders = (orders: Order[]): DuplicateGroup[] => {
  // 按標準化電話號碼分組
  const phoneGroups = new Map<string, DuplicateOrder[]>();

  orders.forEach(order => {
    const normalizedPhone = normalizePhone(order.customer.phone);
    if (!normalizedPhone) return; // 跳過無效電話號碼

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
  const normalizedPhone = normalizePhone(order.customer.phone);
  if (!normalizedPhone) return false;

  // 計算有相同標準化電話號碼的訂單數量
  const samePhoneOrders = allOrders.filter(o =>
    normalizePhone(o.customer.phone) === normalizedPhone
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
  const formatCsvField = (str: string) => {
    if (!str) return '';
    // 如果包含逗號、引號或換行符，需要用引號包圍並轉義內部引號
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

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
      if (order.deliveryTime.includes('上')) wishTime = '1';
      else if (order.deliveryTime.includes('下')) wishTime = '2';
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
