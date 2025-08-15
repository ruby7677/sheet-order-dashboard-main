import { Order, OrderStats, OrderItem, PaymentStatus } from '@/types/order';
import { supabase } from '@/integrations/supabase/client';

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

// 從 Supabase 取得訂單資料
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

  try {
    // 建立查詢
    let query = supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        customer_phone,
        customer_address,
        delivery_method,
        delivery_address,
        delivery_time,
        due_date,
        delivery_date,
        total_amount,
        status,
        payment_status,
        payment_method,
        notes,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false });

    const { data: orders, error } = await query;

    if (error) {
      console.error('Supabase 訂單查詢錯誤:', error);
      throw new Error(`讀取訂單失敗: ${error.message}`);
    }

    if (!orders) {
      console.warn('Supabase 回傳空資料');
      return [];
    }

    // 獲取訂單商品明細
    const orderIds = orders.map(order => order.id);
    let orderItems: any[] = [];
    
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

      if (itemsError) {
        console.error('訂單商品明細查詢錯誤:', itemsError);
      } else {
        orderItems = items || [];
      }
    }

    // 將 Supabase 資料轉換成前端 Order 型別
    const ordersWithItems: Order[] = orders.map((order) => {
      const items = orderItems
        .filter(item => item.order_id === order.id)
        .map(item => ({
          product: item.product_name || '未知商品',
          quantity: item.quantity || 0,
          price: Number(item.unit_price) || 0,
          subtotal: Number(item.total_price) || 0,
        }));

      // 確保狀態符合類型定義
      const validStatus = ['訂單確認中', '已抄單', '已出貨', '取消訂單'].includes(order.status) 
        ? order.status as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'
        : '訂單確認中';

      return {
        createdAt: order.created_at?.split('T')[0] || '',
        id: order.id,
        orderNumber: order.order_number || '',
        customer: {
          name: order.customer_name || '',
          phone: order.customer_phone || ''
        },
        items,
        total: Number(order.total_amount) || 0,
        dueDate: order.due_date || '',
        deliveryTime: order.delivery_time || '',
        notes: order.notes || '',
        status: validStatus,
        deliveryMethod: order.delivery_method || '',
        deliveryAddress: order.delivery_address || order.customer_address || '',
        paymentMethod: order.payment_method || '',
        paymentStatus: (order.payment_status as PaymentStatus) || ''
      };
    });

    // 更新快取
    orderCache = {
      timestamp: now,
      data: ordersWithItems,
      filters: filters ? { ...filters } : undefined
    };

    // 有過濾條件時前端進行過濾
    const filteredOrders = filters ? filterOrdersInMemory(ordersWithItems, filters) : ordersWithItems;
    
    return filteredOrders;
  } catch (error) {
    console.error('fetchOrders 錯誤:', error);
    throw error;
  }
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

// 更新訂單狀態
export const updateOrderStatus = async (id: string, status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'): Promise<void> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('更新訂單狀態失敗:', error);
      throw new Error(`更新訂單狀態失敗: ${error.message}`);
    }

    clearOrderCache(); // 清除快取，強制重新獲取最新數據
  } catch (error) {
    console.error('updateOrderStatus 錯誤:', error);
    throw error;
  }
};

// 批次更新訂單狀態
export const batchUpdateOrderStatus = async (ids: string[], status: '訂單確認中' | '已抄單' | '已出貨' | '取消訂單'): Promise<void> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status,
        updated_at: new Date().toISOString()
      })
      .in('id', ids);

    if (error) {
      console.error('批次更新訂單狀態失敗:', error);
      throw new Error(`批次更新訂單狀態失敗: ${error.message}`);
    }

    clearOrderCache();
  } catch (error) {
    console.error('batchUpdateOrderStatus 錯誤:', error);
    throw error;
  }
};

// 更新款項狀態
export const updateOrderPaymentStatus = async (id: string, paymentStatus: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      console.error('更新款項狀態失敗:', error);
      throw new Error(`更新款項狀態失敗: ${error.message}`);
    }

    clearOrderCache();
  } catch (error) {
    console.error('updateOrderPaymentStatus 錯誤:', error);
    throw error;
  }
};

// 批次更新款項狀態
export const batchUpdateOrderPaymentStatus = async (ids: string[], paymentStatus: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        payment_status: paymentStatus,
        updated_at: new Date().toISOString()
      })
      .in('id', ids);

    if (error) {
      console.error('批次更新款項狀態失敗:', error);
      throw new Error(`批次更新款項狀態失敗: ${error.message}`);
    }

    clearOrderCache();
  } catch (error) {
    console.error('batchUpdateOrderPaymentStatus 錯誤:', error);
    throw error;
  }
};

// 更新訂單商品
export const updateOrderItems = async (id: string, items: OrderItem[], total: number): Promise<void> => {
  try {
    // 開始事務
    const { error: deleteError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id);

    if (deleteError) {
      throw new Error(`刪除舊商品明細失敗: ${deleteError.message}`);
    }

    // 插入新的商品明細
    if (items.length > 0) {
      const orderItems = items.map(item => ({
        order_id: id,
        product_name: item.product,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.subtotal
      }));

      const { error: insertError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (insertError) {
        throw new Error(`插入新商品明細失敗: ${insertError.message}`);
      }
    }

    // 更新訂單總金額
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        total_amount: total,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      throw new Error(`更新訂單總金額失敗: ${updateError.message}`);
    }

    clearOrderCache();
  } catch (error) {
    console.error('updateOrderItems 錯誤:', error);
    throw error;
  }
};

// 刪除訂單
export const deleteOrder = async (id: string): Promise<any> => {
  try {
    // 先刪除訂單商品明細
    const { error: deleteItemsError } = await supabase
      .from('order_items')
      .delete()
      .eq('order_id', id);

    if (deleteItemsError) {
      throw new Error(`刪除訂單商品明細失敗: ${deleteItemsError.message}`);
    }

    // 刪除訂單
    const { error: deleteOrderError } = await supabase
      .from('orders')
      .delete()
      .eq('id', id);

    if (deleteOrderError) {
      throw new Error(`刪除訂單失敗: ${deleteOrderError.message}`);
    }

    clearOrderCache();

    return {
      success: true,
      message: '訂單刪除成功'
    };
  } catch (error) {
    console.error('deleteOrder 錯誤:', error);
    throw error;
  }
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
  try {
    const results = [];
    let totalDeleted = 0;
    let totalFailed = 0;

    for (const id of ids) {
      try {
        await deleteOrder(id);
        results.push({
          id,
          success: true,
          message: '刪除成功'
        });
        totalDeleted++;
      } catch (error) {
        results.push({
          id,
          success: false,
          message: error instanceof Error ? error.message : '刪除失敗'
        });
        totalFailed++;
      }
    }

    return {
      success: totalDeleted > 0,
      results,
      totalDeleted,
      totalFailed
    };
  } catch (error) {
    console.error('batchDeleteOrders 錯誤:', error);
    throw error;
  }
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
  const csvContent = rows.join('\r\n');

  return csvContent;
};

// 新增訂單到 Supabase
export const createOrder = async (orderData: {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  deliveryMethod: string;
  deliveryAddress?: string;
  deliveryTime?: string;
  dueDate?: string;
  paymentMethod: string;
  paymentStatus?: string;
  status?: string;
  notes?: string;
  items: OrderItem[];
  totalAmount: number;
}): Promise<Order> => {
  try {
    // 插入訂單
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: `ORD-${Date.now()}`,
        customer_name: orderData.customerName,
        customer_phone: orderData.customerPhone,
        customer_address: orderData.customerAddress,
        delivery_method: orderData.deliveryMethod,
        delivery_address: orderData.deliveryAddress,
        delivery_time: orderData.deliveryTime,
        due_date: orderData.dueDate,
        payment_method: orderData.paymentMethod,
        payment_status: orderData.paymentStatus || '未收費',
        status: orderData.status || '訂單確認中',
        notes: orderData.notes,
        total_amount: orderData.totalAmount
      })
      .select()
      .single();

    if (orderError) {
      throw new Error(`新增訂單失敗: ${orderError.message}`);
    }

    // 插入訂單商品明細
    if (orderData.items.length > 0) {
      const orderItems = orderData.items.map(item => ({
        order_id: order.id,
        product_name: item.product,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.subtotal
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) {
        throw new Error(`新增訂單商品明細失敗: ${itemsError.message}`);
      }
    }

    clearOrderCache();

    // 返回格式化的訂單
    return {
      createdAt: order.created_at?.split('T')[0] || '',
      id: order.id,
      orderNumber: order.order_number || '',
      customer: {
        name: order.customer_name || '',
        phone: order.customer_phone || ''
      },
      items: orderData.items,
      total: orderData.totalAmount,
      dueDate: order.due_date || '',
      deliveryTime: order.delivery_time || '',
      notes: order.notes || '',
      status: (order.status as '訂單確認中' | '已抄單' | '已出貨' | '取消訂單') || '訂單確認中',
      deliveryMethod: order.delivery_method || '',
      deliveryAddress: order.delivery_address || order.customer_address || '',
      paymentMethod: order.payment_method || '',
      paymentStatus: (order.payment_status as PaymentStatus) || ''
    };
  } catch (error) {
    console.error('createOrder 錯誤:', error);
    throw error;
  }
};