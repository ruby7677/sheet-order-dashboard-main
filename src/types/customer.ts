// 客戶資料類型定義

export interface Customer {
  id: string;
  name: string;
  phone: string;
  deliveryMethod: string;
  address: string;
  contactMethod: string;
  socialId: string;
  orderTime?: string;
  items?: string;
}

export interface CustomerWithStats extends Customer {
  purchaseCount: number;
  purchasedItems: string[];
  region: string; // 地區，從地址中提取
}

export interface CustomerOrder {
  id: string;
  orderTime: string;
  items: string;
  name?: string; // 可選，用於顯示訂單歷史
}

export interface CustomerStats {
  total: number;
  regions: { [key: string]: number }; // 各地區客戶數量
  purchaseCounts: { [key: string]: number }; // 購買次數分佈
}

export interface CustomerFilterCriteria {
  region?: string;
  purchaseCount?: string; // '1', '2-5', '5+'
  purchasedItem?: string;
  search?: string;
}
