export interface FilterCriteria {
  status: string;
  deliveryMethod: string;
  paymentStatus: string;
  date?: string; // 保留向後兼容性
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  search: string;
}
