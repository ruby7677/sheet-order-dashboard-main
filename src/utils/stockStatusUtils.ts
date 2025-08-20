/**
 * 庫存狀態中英文轉換工具
 * 確保前端顯示中文，後端儲存英文
 */

export type StockStatus = 'available' | 'limited' | 'sold_out';

export interface StockStatusOption {
  value: StockStatus;
  label: string;
  badgeClass: string;
}

// 庫存狀態選項定義
export const STOCK_STATUS_OPTIONS: StockStatusOption[] = [
  {
    value: 'available',
    label: '有庫存',
    badgeClass: 'bg-green-100 text-green-800'
  },
  {
    value: 'limited',
    label: '庫存有限',
    badgeClass: 'bg-yellow-100 text-yellow-800'
  },
  {
    value: 'sold_out',
    label: '已完售',
    badgeClass: 'bg-red-100 text-red-800'
  }
];

/**
 * 將英文庫存狀態轉換為中文顯示
 */
export const getStockStatusLabel = (status: string): string => {
  const option = STOCK_STATUS_OPTIONS.find(opt => opt.value === status);
  return option?.label || status;
};

/**
 * 取得庫存狀態的樣式類別
 */
export const getStockStatusClass = (status: string): string => {
  const option = STOCK_STATUS_OPTIONS.find(opt => opt.value === status);
  return option?.badgeClass || 'bg-gray-100 text-gray-800';
};

/**
 * 驗證庫存狀態值是否有效
 */
export const isValidStockStatus = (status: string): status is StockStatus => {
  return STOCK_STATUS_OPTIONS.some(opt => opt.value === status);
};