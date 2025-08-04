import { Customer, CustomerWithStats, CustomerOrder, CustomerFilterCriteria, CustomerStats } from '@/types/customer';

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
export const fetchCustomers = async (filters?: CustomerFilterCriteria): Promise<CustomerWithStats[]> => {
  // 檢查是否有快取且未過期
  const now = Date.now();

  // 如果沒有進行搜尋或篩選，且有快取且未過期，直接使用快取資料
  if (
    customerCache &&
    (now - customerCache.timestamp < CACHE_DURATION) &&
    (!filters || (!filters.region && !filters.purchaseCount && !filters.purchasedItem && !filters.search))
  ) {
    console.log('使用快取的客戶資料');

    // 有過濾條件時，在前端篩選快取中的資料
    if (filters) {
      return filterCustomersInMemory(customerCache.data, filters);
    }

    return customerCache.data;
  }

  // 從後端 API 取得客戶資料，添加隨機參數防止 Cloudflare 快取
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  // 添加多個隨機參數，確保每次請求都是唯一的
  const url = new URL(`${window.location.origin}${API_BASE}/get_customers_from_sheet.php`);
  url.searchParams.append('refresh', '1');
  url.searchParams.append('_', timestamp.toString());
  url.searchParams.append('nonce', nonce);
  url.searchParams.append('v', '1.1'); // API 版本號
  url.searchParams.append('random', Math.random().toString(36).substring(2, 15)); // 額外的隨機參數

  // 使用 no-store 快取策略
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });

  if (!res.ok) {
    throw new Error(`獲取客戶資料失敗: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();

  if (!result.success) {
    throw new Error(result.message || '獲取客戶資料失敗');
  }

  // 將原始客戶資料轉換為帶有統計資訊的客戶資料
  const customers = result.data as Customer[];

  // 按電話號碼分組
  const customersByPhone: { [phone: string]: Customer[] } = {};
  customers.forEach(customer => {
    if (!customer.phone) return;

    if (!customersByPhone[customer.phone]) {
      customersByPhone[customer.phone] = [];
    }
    customersByPhone[customer.phone].push(customer);
  });

  // 處理每個電話號碼的客戶資料
  const customersWithStats: CustomerWithStats[] = [];

  Object.entries(customersByPhone).forEach(([phone, customerGroup]) => {
    // 使用最新的客戶資料（假設資料是按時間排序的，最後一筆是最新的）
    const latestCustomer = customerGroup[customerGroup.length - 1];

    // 提取地區資訊
    const region = extractRegion(latestCustomer.address);

    // 收集所有購買過的商品
    const purchasedItems = new Set<string>();
    customerGroup.forEach(customer => {
      if (customer.items) {
        // 分割商品字串，通常格式為 "商品1 x 數量, 商品2 x 數量"
        const items = customer.items.split(/[,，]/);
        items.forEach(item => {
          // 提取商品名稱（去除數量部分）
          const productName = item.trim().split(/\s*[xX×]\s*/)[0].trim();
          if (productName) {
            purchasedItems.add(productName);
          }
        });
      }
    });

    // 創建帶有統計資訊的客戶資料
    customersWithStats.push({
      ...latestCustomer,
      purchaseCount: customerGroup.length,
      purchasedItems: Array.from(purchasedItems),
      region
    });
  });

  // 更新快取
  customerCache = {
    timestamp: now,
    data: customersWithStats,
    filters: filters ? { ...filters } : undefined
  };

  // 有過濾條件時前端進行過濾
  if (filters) {
    return filterCustomersInMemory(customersWithStats, filters);
  }

  return customersWithStats;
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

  // 從後端 API 取得客戶訂單資料
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 15);

  const url = new URL(`${window.location.origin}${API_BASE}/get_customer_orders.php`);
  url.searchParams.append('phone', phone);
  url.searchParams.append('refresh', '1');
  url.searchParams.append('_', timestamp.toString());
  url.searchParams.append('nonce', nonce);
  url.searchParams.append('random', Math.random().toString(36).substring(2, 15)); // 額外的隨機參數

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });

  if (!res.ok) {
    throw new Error(`獲取客戶訂單失敗: ${res.status} ${res.statusText}`);
  }

  const result = await res.json();

  if (!result.success) {
    throw new Error(result.message || '獲取客戶訂單失敗');
  }

  const orders = result.data as CustomerOrder[];

  // 更新快取
  customerOrdersCache[phone] = {
    timestamp: now,
    data: orders
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
