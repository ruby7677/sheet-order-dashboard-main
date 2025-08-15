import { Customer, CustomerWithStats, CustomerOrder, CustomerFilterCriteria, CustomerStats } from '@/types/customer';
import { supabase } from '@/integrations/supabase/client';

// 客戶資料快取
let customerCache: {
  timestamp: number;
  data: CustomerWithStats[];
  filters?: CustomerFilterCriteria;
} | null = null;

// 客戶訂單快取
const customerOrdersCache: {
  [phone: string]: {
    timestamp: number;
    data: CustomerOrder[];
  }
} = {};

// 快取有效期（毫秒）
const CACHE_DURATION = 15 * 1000; // 15秒

// 從 Supabase 獲取客戶資料
export const fetchCustomers = async (filters?: CustomerFilterCriteria): Promise<CustomerWithStats[]> => {
  // 檢查是否有快取且未過期
  const now = Date.now();

  if (
    customerCache &&
    (now - customerCache.timestamp < CACHE_DURATION) &&
    (!filters || (!filters.region && !filters.purchaseCount && !filters.purchasedItem && !filters.search))
  ) {
    console.log('使用快取的客戶資料');
    if (filters) return filterCustomersInMemory(customerCache.data, filters);
    return customerCache.data;
  }

  try {
    // 從 Supabase 獲取客戶資料
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase 客戶查詢錯誤:', error);
      throw new Error(`讀取客戶資料失敗: ${error.message}`);
    }

    if (!customers) {
      console.warn('Supabase 客戶資料回傳空值');
      return [];
    }

    // 轉換成前端格式並計算統計資料
    const customersWithStats: CustomerWithStats[] = customers.map(customer => ({
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      deliveryMethod: customer.delivery_method || '',
      address: customer.address || '',
      contactMethod: customer.contact_method || '',
      socialId: customer.social_id || '',
      orderTime: customer.created_at?.split('T')[0] || '',
      items: '', // 這個需要從訂單中推導
      purchaseCount: customer.total_orders || 0,
      purchasedItems: [], // 這個需要從訂單中推導
      region: extractRegion(customer.address || ''),
    }));

    // 更新快取
    customerCache = {
      timestamp: now,
      data: customersWithStats,
      filters: filters ? { ...filters } : undefined,
    };

    // 有過濾條件時前端進行過濾
    return filters ? filterCustomersInMemory(customersWithStats, filters) : customersWithStats;
  } catch (err) {
    console.error('載入客戶資料失敗:', err);
    throw err;
  }
};

// 從地址中提取地區資訊
const extractRegion = (address: string): string => {
  if (!address) return '未知地區';

  // 嘗試匹配常見的地址格式
  const cityMatch = address.match(/^(.*?[市縣])/);
  if (cityMatch) return cityMatch[1];

  // 如果沒有匹配到市或縣，嘗試匹配鄉鎮市區
  const districtMatch = address.match(/^(.*?[鄉鎮市區])/);
  if (districtMatch) return districtMatch[1];

  return '未知地區';
};

// 在記憶體中過濾客戶資料
const filterCustomersInMemory = (customers: CustomerWithStats[], filters: CustomerFilterCriteria): CustomerWithStats[] => {
  let filteredCustomers = [...customers];

  // 地區篩選
  if (filters.region && filters.region !== '所有地區') {
    filteredCustomers = filteredCustomers.filter(customer =>
      customer.region === filters.region || customer.address.includes(filters.region!)
    );
  }

  // 購買次數篩選
  if (filters.purchaseCount) {
    switch (filters.purchaseCount) {
      case '1':
        filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount === 1);
        break;
      case '2-5':
        filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount >= 2 && customer.purchaseCount <= 5);
        break;
      case '5+':
        filteredCustomers = filteredCustomers.filter(customer => customer.purchaseCount > 5);
        break;
    }
  }

  // 購買商品篩選
  if (filters.purchasedItem && filters.purchasedItem !== '所有商品') {
    filteredCustomers = filteredCustomers.filter(customer =>
      customer.purchasedItems.some(item => item.includes(filters.purchasedItem!))
    );
  }

  // 搜尋篩選
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredCustomers = filteredCustomers.filter(customer =>
      customer.name.toLowerCase().includes(searchLower) ||
      customer.phone.includes(filters.search!) ||
      customer.address.toLowerCase().includes(searchLower)
    );
  }

  return filteredCustomers;
};

// 獲取客戶統計資訊
export const getCustomerStats = (customers: CustomerWithStats[]): CustomerStats => {
  const regions: { [key: string]: number } = {};
  const purchaseCounts: { [key: string]: number } = {
    '1': 0,
    '2-5': 0,
    '5+': 0
  };

  customers.forEach(customer => {
    // 統計地區
    if (customer.region) {
      regions[customer.region] = (regions[customer.region] || 0) + 1;
    }

    // 統計購買次數
    if (customer.purchaseCount === 1) {
      purchaseCounts['1']++;
    } else if (customer.purchaseCount >= 2 && customer.purchaseCount <= 5) {
      purchaseCounts['2-5']++;
    } else if (customer.purchaseCount > 5) {
      purchaseCounts['5+']++;
    }
  });

  return {
    total: customers.length,
    regions,
    purchaseCounts
  };
};

// 獲取客戶訂單歷史
export const fetchCustomerOrders = async (phone: string): Promise<CustomerOrder[]> => {
  // 檢查是否有快取且未過期
  const now = Date.now();
  if (
    customerOrdersCache[phone] &&
    (now - customerOrdersCache[phone].timestamp < CACHE_DURATION)
  ) {
    console.log('使用快取的客戶訂單資料');
    return customerOrdersCache[phone].data;
  }

  try {
    // 從 Supabase 獲取該客戶的訂單
    const { data: orders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        customer_name,
        created_at,
        order_items (
          product_name,
          quantity
        )
      `)
      .eq('customer_phone', phone)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('客戶訂單查詢錯誤:', error);
      throw new Error(`讀取客戶訂單失敗: ${error.message}`);
    }

    const customerOrders: CustomerOrder[] = (orders || []).map(order => ({
      id: order.id,
      orderTime: order.created_at?.split('T')[0] || '',
      items: (order.order_items || [])
        .map((item: any) => `${item.product_name} x ${item.quantity}`)
        .join(', '),
      name: order.customer_name || ''
    }));

    // 更新快取
    customerOrdersCache[phone] = {
      timestamp: now,
      data: customerOrders,
    };

    return customerOrders;
  } catch (error) {
    console.error('fetchCustomerOrders 錯誤:', error);
    throw error;
  }
};

// 清除客戶資料快取
export const clearCustomerCache = () => {
  customerCache = null;
  console.log('已清除客戶資料快取');
};

// 清除客戶訂單快取
export const clearCustomerOrderCache = (phone?: string) => {
  if (phone) {
    delete customerOrdersCache[phone];
    console.log(`已清除客戶 ${phone} 的訂單快取`);
  } else {
    Object.keys(customerOrdersCache).forEach(key => {
      delete customerOrdersCache[key];
    });
    console.log('已清除所有客戶訂單快取');
  }
};

// 新增客戶到 Supabase
export const createCustomer = async (customerData: {
  name: string;
  phone: string;
  address?: string;
  deliveryMethod?: string;
  contactMethod?: string;
  socialId?: string;
  notes?: string;
}): Promise<Customer> => {
  try {
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        name: customerData.name,
        phone: customerData.phone,
        address: customerData.address,
        delivery_method: customerData.deliveryMethod,
        contact_method: customerData.contactMethod,
        social_id: customerData.socialId,
        notes: customerData.notes
      })
      .select()
      .single();

    if (error) {
      throw new Error(`新增客戶失敗: ${error.message}`);
    }

    clearCustomerCache();

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address || '',
      deliveryMethod: customer.delivery_method || '',
      contactMethod: customer.contact_method || '',
      socialId: customer.social_id || ''
    };
  } catch (error) {
    console.error('createCustomer 錯誤:', error);
    throw error;
  }
};

// 更新客戶資料
export const updateCustomer = async (id: string, customerData: {
  name?: string;
  phone?: string;
  address?: string;
  deliveryMethod?: string;
  contactMethod?: string;
  socialId?: string;
  notes?: string;
}): Promise<void> => {
  try {
    const updateData: any = {};
    if (customerData.name !== undefined) updateData.name = customerData.name;
    if (customerData.phone !== undefined) updateData.phone = customerData.phone;
    if (customerData.address !== undefined) updateData.address = customerData.address;
    if (customerData.deliveryMethod !== undefined) updateData.delivery_method = customerData.deliveryMethod;
    if (customerData.contactMethod !== undefined) updateData.contact_method = customerData.contactMethod;
    if (customerData.socialId !== undefined) updateData.social_id = customerData.socialId;
    if (customerData.notes !== undefined) updateData.notes = customerData.notes;
    
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id);

    if (error) {
      throw new Error(`更新客戶資料失敗: ${error.message}`);
    }

    clearCustomerCache();
  } catch (error) {
    console.error('updateCustomer 錯誤:', error);
    throw error;
  }
};

// 刪除客戶
export const deleteCustomer = async (id: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`刪除客戶失敗: ${error.message}`);
    }

    clearCustomerCache();
  } catch (error) {
    console.error('deleteCustomer 錯誤:', error);
    throw error;
  }
};