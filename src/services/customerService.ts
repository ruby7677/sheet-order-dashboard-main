import { Customer, CustomerWithStats, CustomerOrder, CustomerFilterCriteria, CustomerStats } from '@/types/customer';
import { fetchOrders } from './orderService';

// 根據環境動態設置 API 基礎路徑
// 使用全局配置或默認值
const getApiBase = () => {
  // 檢查是否有全局配置
  if (window.API_CONFIG && typeof window.API_CONFIG.getApiBase === 'function') {
    return window.API_CONFIG.getApiBase();
  }

  // 檢查當前環境（備用方案）
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const port = window.location.port;

  // 本地開發環境（localhost:8080 指向 htdocs，需要完整路徑）
  if (isLocalhost && port === '8080') {
    return '/sheet-order-dashboard-main/api';
  }

  // Cloudflare Tunnels 環境（node.767780.xyz 直接指向 sheet-order-dashboard-main 目錄）
  // 所以 API 路徑就是 /api
  return '/api';
};

const API_BASE = getApiBase();

// 輸出當前使用的 API 路徑，方便調試
console.log('客戶服務 API 路徑:', API_BASE);

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

// 從後端 API 獲取客戶資料
// 從訂單資料推導客戶清單與統計（避免呼叫不存在或失敗的客戶 API）
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

  // 從訂單資料推導（備援方案）
  const deriveFromOrders = async (): Promise<CustomerWithStats[]> => {
    const orders = await fetchOrders();

    const customersByPhone: { [phone: string]: typeof orders } = {} as any;
    orders.forEach(o => {
      const phone = o.customer?.phone?.trim();
      if (!phone) return;
      if (!customersByPhone[phone]) customersByPhone[phone] = [] as any;
      (customersByPhone[phone] as any).push(o);
    });

    const customersWithStats: CustomerWithStats[] = Object.entries(customersByPhone).map(([phone, group]) => {
      const latest = group[group.length - 1];
      const name = latest.customer?.name || '';
      const address = latest.deliveryAddress || '';
      const region = extractRegion(address);
      const deliveryMethod = latest.deliveryMethod || '';

      const purchasedSet = new Set<string>();
      group.forEach(o => o.items.forEach(i => purchasedSet.add(i.product)));
      const purchasedItems = Array.from(purchasedSet);

      const itemsStr = latest.items.map(i => `${i.product} x ${i.quantity}`).join('、');

      const c: CustomerWithStats = {
        id: phone,
        name,
        phone,
        deliveryMethod,
        address,
        contactMethod: '',
        socialId: '',
        orderTime: latest.createdAt || latest.dueDate || '',
        items: itemsStr,
        purchaseCount: group.length,
        purchasedItems,
        region,
      };

      return c;
    });

    return customersWithStats;
  };

  try {
    // 主要來源：從 Sheets 的「客戶名單」讀取
    const resp = await fetch(`${API_BASE}/get_customers_from_sheet.php?nonce=${now}`, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    const json = await resp.json();

    if (!json?.success || !Array.isArray(json.data)) {
      console.warn('客戶名單 API 回傳格式不正確，改用訂單資料推導');
      const fallback = await deriveFromOrders();
      customerCache = { timestamp: now, data: fallback, filters: filters ? { ...filters } : undefined };
      return filters ? filterCustomersInMemory(fallback, filters) : fallback;
    }

    type RawCustomer = {
      id?: string | number;
      name?: string;
      phone?: string;
      deliveryMethod?: string;
      address?: string;
      contactMethod?: string;
      socialId?: string;
      orderTime?: string;
      items?: string;
    };

    // 以電話為 key 聚合，避免表內重複列
    const groups: Record<string, CustomerWithStats> = {};
    (json.data as RawCustomer[]).forEach((row, idx) => {
      const phone = (row.phone || '').trim();
      const name = (row.name || '').trim();
      const address = (row.address || '').trim();
      const deliveryMethod = (row.deliveryMethod || '').trim();
      const orderTime = row.orderTime || '';
      const itemsStr = row.items || '';

      const purchased: string[] = [];
      if (itemsStr) {
        // 以常見分隔符拆分，並移除數量（x/X/×）
        const parts = itemsStr.split(/[,，、\n]/).map(p => p.trim()).filter(Boolean);
        parts.forEach(p => {
          const product = p.split(/x|X|×/)[0].trim();
          if (product) purchased.push(product);
        });
      }

      const id = phone || String(row.id ?? idx);
      const region = extractRegion(address);
      const key = phone || id;

      if (!groups[key]) {
        groups[key] = {
          id,
          name,
          phone,
          deliveryMethod,
          address,
          contactMethod: row.contactMethod || '',
          socialId: row.socialId || '',
          orderTime,
          items: itemsStr,
          purchaseCount: 0,
          purchasedItems: [],
          region,
        };
      }

      const g = groups[key];
      g.purchaseCount += 1;
      g.purchasedItems = Array.from(new Set([...g.purchasedItems, ...purchased]));
      // 用較新的非空資料覆蓋
      if (!g.name && name) g.name = name;
      if (!g.address && address) g.address = address;
      if (!g.deliveryMethod && deliveryMethod) g.deliveryMethod = deliveryMethod;
      if (!g.orderTime && orderTime) g.orderTime = orderTime;
      if (!g.items && itemsStr) g.items = itemsStr;
    });

    const customersWithStats = Object.values(groups);

    // 更新快取
    customerCache = {
      timestamp: now,
      data: customersWithStats,
      filters: filters ? { ...filters } : undefined,
    };

    // 有過濾條件時前端進行過濾
    return filters ? filterCustomersInMemory(customersWithStats, filters) : customersWithStats;
  } catch (err) {
    console.error('載入客戶名單失敗，改用訂單資料推導:', err);
    const fallback = await deriveFromOrders();
    customerCache = { timestamp: now, data: fallback, filters: filters ? { ...filters } : undefined };
    return filters ? filterCustomersInMemory(fallback, filters) : fallback;
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
// 從訂單資料推導客戶的訂單歷史
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

  const allOrders = await fetchOrders();
  const orders = allOrders
    .filter(o => o.customer?.phone === phone)
    .map(o => ({
      id: o.id,
      orderTime: o.createdAt || o.dueDate || '',
      items: o.items.map(i => `${i.product} x ${i.quantity}`).join(', '),
      name: o.customer?.name,
    }));

  // 更新快取
  customerOrdersCache[phone] = {
    timestamp: now,
    data: orders,
  };

  return orders;
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
