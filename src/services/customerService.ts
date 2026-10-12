import { CustomerWithStats, CustomerOrder, CustomerFilterCriteria, CustomerStats } from '@/types/customer';
import { canonicalizePhone } from './orderService';

const getApiEndpoint = (endpoint: string): string => {
  if (!endpoint.startsWith('/api/') || endpoint.includes('://')) throw new Error('無效的管理 API 路徑');
  return endpoint;
};

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

interface RawCustomer {
  id?: string | number;
  name?: string;
  phone?: string;
  normalized_phone?: string | null;
  deliveryMethod?: string;
  address?: string;
  contactMethod?: string;
  socialId?: string;
  orderTime?: string;
  items?: string;
}

function phoneForRow(row: RawCustomer): string | null {
  const localCanonical = canonicalizePhone(String(row.phone ?? ''));
  if (Object.prototype.hasOwnProperty.call(row, 'normalized_phone')) {
    const apiCanonical = row.normalized_phone;
    return typeof apiCanonical === 'string' && apiCanonical === localCanonical ? apiCanonical : null;
  }
  return localCanonical;
}

function productsFromRow(items: string): string[] {
  if (!items) return [];
  return items.split(/[,，、\n]/).map((part) => part.trim().split(/x|X|×/)[0].trim()).filter(Boolean);
}

function isLaterRecord(candidate: string, current: string): boolean {
  if (!candidate) return false;
  const candidateTime = Date.parse(candidate);
  const currentTime = Date.parse(current);
  if (!Number.isFinite(candidateTime)) return false;
  return !Number.isFinite(currentTime) || candidateTime > currentTime;
}

/** Reads customer rows from Sheets; a failed API read is never disguised as a derived list. */
export const fetchCustomers = async (
  filters?: CustomerFilterCriteria,
  options?: { forceRefresh?: boolean },
): Promise<CustomerWithStats[]> => {
  const now = Date.now();
  if (!options?.forceRefresh && customerCache && now - customerCache.timestamp < CACHE_DURATION) {
    return filters ? filterCustomersInMemory(customerCache.data, filters) : customerCache.data;
  }
  if (options?.forceRefresh) customerCache = null;

  const endpoint = getApiEndpoint('/api/get_customers_from_sheet.php');
  const response = await fetch(`${endpoint}?nonce=${now}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error('客戶資料目前無法讀取，請重新載入或稍後再試。');

  const result = await response.json();
  if (!result?.success || !Array.isArray(result.data)) {
    throw new Error('客戶資料回應格式錯誤，請重新載入或稍後再試。');
  }

  const groups = new Map<string, CustomerWithStats>();
  (result.data as RawCustomer[]).forEach((row, index) => {
    const phone = String(row.phone ?? '').trim();
    const normalizedPhone = phoneForRow(row);
    const rowId = String(row.id ?? index);
    // The canonical phone key is only a frontend grouping/selection key, not a
    // persistent customer UUID and never an ID for a write operation.
    const id = normalizedPhone ? `phone:${normalizedPhone}` : rowId;
    const key = id;
    const name = String(row.name ?? '').trim();
    const address = String(row.address ?? '').trim();
    const deliveryMethod = String(row.deliveryMethod ?? '').trim();
    const orderTime = String(row.orderTime ?? '');
    const items = String(row.items ?? '');
    const purchasedItems = productsFromRow(items);
    const sourceRecord = { rowId, name, phone, deliveryMethod, address, orderTime, items };
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        id,
        name,
        phone,
        normalizedPhone,
        deliveryMethod,
        address,
        contactMethod: String(row.contactMethod ?? ''),
        socialId: String(row.socialId ?? ''),
        orderTime,
        items,
        purchaseCount: 1,
        purchasedItems,
        region: extractRegion(address),
        sourceRecords: [sourceRecord],
      });
      return;
    }

    existing.sourceRecords = [...(existing.sourceRecords ?? []), sourceRecord];
    existing.purchaseCount += 1;
    existing.purchasedItems = Array.from(new Set([...existing.purchasedItems, ...purchasedItems]));
    if (isLaterRecord(orderTime, existing.orderTime)) {
      existing.name = name || existing.name;
      existing.phone = phone || existing.phone;
      existing.deliveryMethod = deliveryMethod || existing.deliveryMethod;
      existing.address = address || existing.address;
      existing.contactMethod = String(row.contactMethod ?? '') || existing.contactMethod;
      existing.socialId = String(row.socialId ?? '') || existing.socialId;
      existing.orderTime = orderTime;
      existing.items = items || existing.items;
      existing.region = extractRegion(existing.address);
    } else {
      if (!existing.name && name) existing.name = name;
      if (!existing.address && address) {
        existing.address = address;
        existing.region = extractRegion(address);
      }
      if (!existing.deliveryMethod && deliveryMethod) existing.deliveryMethod = deliveryMethod;
      if (!existing.items && items) existing.items = items;
    }
  });

  const customers = Array.from(groups.values());
  customerCache = { timestamp: Date.now(), data: customers };
  return filters ? filterCustomersInMemory(customers, filters) : customers;
};

// 從地址中提取地區資訊
const extractRegion = (address: string): string => {
  if (!address) {return '未知地區';}

  // 嘗試匹配常見的地址格式
  const cityMatch = address.match(/^(.*?[市縣])/);
  if (cityMatch) {return cityMatch[1];}

  // 如果沒有匹配到市或縣，嘗試匹配鄉鎮市區
  const districtMatch = address.match(/^(.*?[鄉鎮市區])/);
  if (districtMatch) {return districtMatch[1];}

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
    const rawSearch = filters.search.trim();
    const searchLower = rawSearch.toLowerCase();
    const phoneSearch = canonicalizePhone(rawSearch);
    filteredCustomers = filteredCustomers.filter(customer =>
      customer.name.toLowerCase().includes(searchLower) ||
      customer.phone.toLowerCase().includes(searchLower) ||
      (phoneSearch !== null && customer.normalizedPhone === phoneSearch) ||
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

export class InvalidCustomerPhoneError extends Error {
  constructor() {
    super('電話格式無效，無法安全查詢訂單歷史。');
    this.name = 'InvalidCustomerPhoneError';
  }
}

// 獲取客戶訂單歷史
// 使用專門的客戶訂單 API 端點
export const fetchCustomerOrders = async (
  phone: string,
  options?: { forceRefresh?: boolean },
): Promise<CustomerOrder[]> => {
  // 檢查是否有快取且未過期
  const phoneKey = canonicalizePhone(phone);
  if (!phoneKey) throw new InvalidCustomerPhoneError();
  const now = Date.now();

  if (!options?.forceRefresh && customerOrdersCache[phoneKey] && now - customerOrdersCache[phoneKey].timestamp < CACHE_DURATION) {
    return customerOrdersCache[phoneKey].data;
  }
  if (options?.forceRefresh) delete customerOrdersCache[phoneKey];

  const response = await fetch(`/api/customers/orders?phone=${encodeURIComponent(phoneKey)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 400) throw new InvalidCustomerPhoneError();
  if (!response.ok) throw new Error('客戶訂單歷史目前無法讀取，請稍後重試。');

  const result = await response.json();
  if (!result?.success || !Array.isArray(result.data)) {
    throw new Error('客戶訂單歷史回應格式錯誤，請稍後重試。');
  }

  const orders: CustomerOrder[] = result.data.map((order: { id?: string | number; orderTime?: string; items?: string; name?: string }, index: number) => ({
    id: order.id !== undefined && order.id !== null ? String(order.id) : `order-${index}`,
    orderTime: String(order.orderTime ?? ''),
    items: String(order.items ?? ''),
    name: String(order.name ?? ''),
  }));

  customerOrdersCache[phoneKey] = { timestamp: Date.now(), data: orders };
  return orders;
};

// 清除客戶資料快取
export const clearCustomerCache = () => {
  customerCache = null;
};

// 清除客戶訂單快取
export const clearCustomerOrderCache = (phone?: string) => {
  if (phone) {
    const phoneKey = canonicalizePhone(phone);
    if (phoneKey) delete customerOrdersCache[phoneKey];
  } else {
    Object.keys(customerOrdersCache).forEach(key => delete customerOrdersCache[key]);
  }
};
