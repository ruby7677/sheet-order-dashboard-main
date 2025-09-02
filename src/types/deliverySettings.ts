/**
 * 到貨日期設定相關的類型定義
 */

export interface DeliveryDateRange {
  start_date: string;
  end_date: string;
  description?: string;
  updated_by: string;
  updated_at?: string;
}

export interface DeliveryRules {
  home_delivery: {
    exclude_sunday: boolean;
    advance_days: number;
    description: string;
  };
  store_pickup: {
    exclude_sunday: boolean;
    advance_days: number;
    description: string;
  };
}

export interface DeliverySettings {
  delivery_period: DeliveryDateRange;
  delivery_rules: DeliveryRules;
}

export interface AvailableDate {
  value: string;
  display: string;
  dayOfWeek: number;
  isSunday?: boolean;
}

export interface DeliverySettingsFormData {
  start_date: string;
  end_date: string;
  description?: string;
}

export interface DeliverySettingsApiResponse {
  success: boolean;
  data?: DeliverySettings;
  message?: string;
}

export interface AvailableDatesApiResponse {
  success: boolean;
  data?: AvailableDate[];
  period?: DeliveryDateRange;
  delivery_method?: string;
  message?: string;
}

export type DeliveryMethod = '宅配到府' | '超商取貨';

// 表單驗證相關類型
export interface ValidationError {
  field: string;
  message: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Hook 相關類型
export interface UseDeliverySettingsOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

export interface UseAvailableDatesOptions extends UseDeliverySettingsOptions {
  deliveryMethod?: DeliveryMethod;
  startDate?: string;
  endDate?: string;
}

// 統計和狀態類型
export interface DeliverySettingsStats {
  totalAvailableDays: number;
  homeDeliveryDays: number;
  storePickupDays: number;
  excludedSundays: number;
}

export interface DatePreviewData {
  homeDeliveryDates: AvailableDate[];
  storePickupDates: AvailableDate[];
  stats: DeliverySettingsStats;
}