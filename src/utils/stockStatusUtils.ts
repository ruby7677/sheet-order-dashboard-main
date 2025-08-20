/**
 * 庫存狀態中英文對照工具
 * 前端顯示中文，後端儲存英文枚舉值
 */

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

// 庫存狀態中英文對照表（配合數據庫約束）
export const STOCK_STATUS_MAP: Record<StockStatus, string> = {
  in_stock: '有庫存',
  low_stock: '庫存有限', 
  out_of_stock: '已完售',
};

// 反向對照表：中文轉英文
export const STOCK_STATUS_REVERSE_MAP: Record<string, StockStatus> = {
  '有庫存': 'in_stock',
  '庫存有限': 'low_stock',
  '已完售': 'out_of_stock',
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
    case 'in_stock':
      return 'default'; // 綠色
    case 'low_stock':
      return 'secondary'; // 黃色
    case 'out_of_stock':
      return 'destructive'; // 紅色
    default:
      return 'secondary';
  }
}

/**
 * 所有可用的庫存狀態選項（用於下拉選單）
 */
export const STOCK_STATUS_OPTIONS = [
  { value: 'in_stock', label: '有庫存' },
  { value: 'low_stock', label: '庫存有限' },
  { value: 'out_of_stock', label: '已完售' },
] as const;