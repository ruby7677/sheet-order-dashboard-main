/**
 * 庫存狀態中英文對照工具
 * 前端顯示中文，後端儲存英文枚舉值
 */

export type StockStatus = 'available' | 'limited' | 'sold_out';

// 庫存狀態中英文對照表
export const STOCK_STATUS_MAP: Record<StockStatus, string> = {
  available: '有庫存',
  limited: '庫存有限', 
  sold_out: '已完售',
};

// 反向對照表：中文轉英文
export const STOCK_STATUS_REVERSE_MAP: Record<string, StockStatus> = {
  '有庫存': 'available',
  '庫存有限': 'limited',
  '已完售': 'sold_out',
};

/**
 * 將英文狀態轉換為中文顯示
 */
export function getStockStatusLabel(status: string): string {
  return STOCK_STATUS_MAP[status as StockStatus] || status;
}

/**
 * 將中文狀態轉換為英文儲存值
 */
export function getStockStatusValue(label: string): StockStatus {
  return STOCK_STATUS_REVERSE_MAP[label] || label as StockStatus;
}

/**
 * 獲取狀態對應的樣式類別
 */
export function getStockStatusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'available':
      return 'default'; // 綠色
    case 'limited':
      return 'secondary'; // 黃色
    case 'sold_out':
      return 'destructive'; // 紅色
    default:
      return 'secondary';
  }
}

/**
 * 所有可用的庫存狀態選項（用於下拉選單）
 */
export const STOCK_STATUS_OPTIONS = [
  { value: 'available', label: '有庫存' },
  { value: 'limited', label: '庫存有限' },
  { value: 'sold_out', label: '已完售' },
] as const;