
import React, { useState, useImperativeHandle, forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search, X } from 'lucide-react';

import { FilterCriteria } from '@/types/filters';

interface OrderFiltersProps {
  onFilterChange: (filters: Partial<FilterCriteria>) => void;
}

export interface OrderFiltersRef {
  resetFilters: () => void;
}

const OrderFilters = forwardRef<OrderFiltersRef, OrderFiltersProps>(({ onFilterChange }, ref) => {
  const [status, setStatus] = useState<string>('所有狀態');
  const [deliveryMethod, setDeliveryMethod] = useState<string>('所有配送方式');
  const [paymentStatus, setPaymentStatus] = useState<string>('所有付款狀態');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState<string>('');

  // 統一的篩選更新函數，確保所有篩選條件同時生效
  const updateAllFilters = (updates: Partial<{
    status: string;
    deliveryMethod: string;
    paymentStatus: string;
    startDate: Date | undefined;
    endDate: Date | undefined;
    search: string;
  }>) => {
    // 更新本地狀態
    if (updates.status !== undefined) {setStatus(updates.status);}
    if (updates.deliveryMethod !== undefined) {setDeliveryMethod(updates.deliveryMethod);}
    if (updates.paymentStatus !== undefined) {setPaymentStatus(updates.paymentStatus);}
    if (updates.startDate !== undefined) {setStartDate(updates.startDate);}
    if (updates.endDate !== undefined) {setEndDate(updates.endDate);}
    if (updates.search !== undefined) {setSearch(updates.search);}

    // 計算最新的篩選條件
    const newStatus = updates.status !== undefined ? updates.status : status;
    const newDeliveryMethod = updates.deliveryMethod !== undefined ? updates.deliveryMethod : deliveryMethod;
    const newPaymentStatus = updates.paymentStatus !== undefined ? updates.paymentStatus : paymentStatus;
    const newStartDate = updates.startDate !== undefined ? updates.startDate : startDate;
    const newEndDate = updates.endDate !== undefined ? updates.endDate : endDate;
    const newSearch = updates.search !== undefined ? updates.search : search;

    // 構建完整的篩選條件
    const dateRange = {
      startDate: newStartDate ? format(newStartDate, 'yyyy-MM-dd') : undefined,
      endDate: newEndDate ? format(newEndDate, 'yyyy-MM-dd') : undefined,
    };

    // 一次性更新所有篩選條件
    onFilterChange({
      status: newStatus,
      deliveryMethod: newDeliveryMethod,
      paymentStatus: newPaymentStatus,
      dateRange,
      search: newSearch
    });
  };

  const handleStatusChange = (value: string) => {
    updateAllFilters({ status: value });
  };

  const handleDeliveryMethodChange = (value: string) => {
    updateAllFilters({ deliveryMethod: value });
  };

  const handlePaymentStatusChange = (value: string) => {
    updateAllFilters({ paymentStatus: value });
  };

  const handleStartDateChange = (date: Date | undefined) => {
    updateAllFilters({ startDate: date });
  };

  const handleEndDateChange = (date: Date | undefined) => {
    updateAllFilters({ endDate: date });
  };

  const clearDateRange = () => {
    updateAllFilters({ startDate: undefined, endDate: undefined });
  };

  // 重置所有篩選條件
  const resetAllFilters = () => {
    setStatus('所有狀態');
    setDeliveryMethod('所有配送方式');
    setPaymentStatus('所有付款狀態');
    setStartDate(undefined);
    setEndDate(undefined);
    setSearch('');

    onFilterChange({
      status: '所有狀態',
      deliveryMethod: '所有配送方式',
      paymentStatus: '所有付款狀態',
      dateRange: { startDate: undefined, endDate: undefined },
      search: ''
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateAllFilters({ search });
  };

  // 暴露重置功能給父組件
  useImperativeHandle(ref, () => ({
    resetFilters: resetAllFilters
  }));

  return (
    <div className="space-y-3">
      {/* 清除日期按鈕 */}
      {(startDate || endDate) && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDateRange}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="h-3 w-3 mr-1" />
            清除日期
          </Button>
        </div>
      )}

      {/* 第一行：狀態篩選器 - 緊湊設計 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">訂單狀態</label>
          <Select value={status} onValueChange={handleStatusChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="所有狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="所有狀態">所有狀態</SelectItem>
              <SelectItem value="訂單確認中">訂單確認中</SelectItem>
              <SelectItem value="已抄單">已抄單</SelectItem>
              <SelectItem value="已出貨">已出貨</SelectItem>
              <SelectItem value="取消訂單">取消訂單</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">配送方式</label>
          <Select value={deliveryMethod} onValueChange={handleDeliveryMethodChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="所有配送方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="所有配送方式">所有配送方式</SelectItem>
              <SelectItem value="7-11門市">7-11門市</SelectItem>
              <SelectItem value="宅配到府">宅配到府</SelectItem>
              <SelectItem value="門市取貨">門市取貨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">付款狀態</label>
          <Select value={paymentStatus} onValueChange={handlePaymentStatusChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="所有付款狀態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="所有付款狀態">所有付款狀態</SelectItem>
              <SelectItem value="未收費">未收費</SelectItem>
              <SelectItem value="已收費">已收費</SelectItem>
              <SelectItem value="待轉帳">待轉帳</SelectItem>
              <SelectItem value="未全款">未全款</SelectItem>
              <SelectItem value="特殊">特殊</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 第二行：日期區間和搜尋 - 整合為一行三欄 */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">日期區間與搜尋</label>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {/* 開始日期 */}
          <div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-8 justify-start text-left font-normal text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {startDate ? format(startDate, 'yyyy-MM-dd') : '開始日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={handleStartDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 結束日期 */}
          <div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-8 justify-start text-left font-normal text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {endDate ? format(endDate, 'yyyy-MM-dd') : '結束日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={handleEndDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* 搜尋欄位 */}
          <div>
            <form onSubmit={handleSearch} className="flex gap-1">
              <Input
                placeholder="搜尋訂單編號、姓名或電話"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 h-8 text-sm"
              />
              <Button type="submit" variant="outline" size="sm" className="h-8 px-2 hover:bg-primary/10">
                <Search className="h-3 w-3 text-primary" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
});

OrderFilters.displayName = 'OrderFilters';

export default OrderFilters;
