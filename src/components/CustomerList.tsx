import React, { useState, useEffect } from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { fetchCustomers, clearCustomerCache } from '../services/customerService';
import { CustomerWithStats } from '../types/customer';
import { CustomerFilterCriteria } from '../types/customer';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import CustomerListMobile from './CustomerListMobile'

interface CustomerListProps {
  filters: CustomerFilterCriteria;
  onCustomerClick: (customer: CustomerWithStats) => void;
  onCustomersChange: () => void;
  selected: string[];
  onSelectedChange: (selected: string[]) => void;
  onTotalCountChange?: (total: number) => void; // 新增：回報總數變化
}

const CustomerList: React.FC<CustomerListProps> = ({
  filters,
  onCustomerClick,
  onCustomersChange,
  selected,
  onSelectedChange,
  onTotalCountChange
}) => {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([]);
  const [allCustomers, setAllCustomers] = useState<CustomerWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 20;
  const { toast } = useToast();

  // 載入客戶資料
  useEffect(() => {
    reloadCustomers();
  }, [filters]);

  // 載入客戶的共用函式
  const reloadCustomers = async () => {
    setLoading(true);
    try {
      // 先清除快取，確保從伺服器獲取最新資料
      clearCustomerCache();
      const data = await fetchCustomers(filters);
      setAllCustomers(data); // 儲存所有客戶
      setTotalPages(Math.ceil(data.length / itemsPerPage)); // 計算總頁數

      // 決定當前頁面
      // 如果當前頁碼大於新的總頁數，則設為最後一頁
      const newCurrentPage = currentPage > Math.ceil(data.length / itemsPerPage)
        ? Math.ceil(data.length / itemsPerPage) || 1
        : currentPage;

      setCurrentPage(newCurrentPage);

      // 顯示當前頁的資料
      const startIndex = (newCurrentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, data.length);
      setCustomers(data.slice(startIndex, endIndex));

      // 保留已選中但仍然存在於新資料中的客戶IDs
      if (selected.length > 0) {
        const existingIds = data.map(customer => customer.id);
        const stillExistingSelectedIds = selected.filter(id => existingIds.includes(id));
        onSelectedChange(stillExistingSelectedIds);
      }

      // 回報總數變化
      if (onTotalCountChange) {
        onTotalCountChange(data.length);
      }
    } catch (error) {
      console.error('Failed to load customers:', error);
      toast({
        title: '錯誤',
        description: '載入客戶資料失敗',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // 處理頁面變更
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) {return;}

    setCurrentPage(newPage);
    const startIndex = (newPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allCustomers.length);
    setCustomers(allCustomers.slice(startIndex, endIndex));
  };

  // 處理全選/取消全選
  const handleSelectAll = () => {
    if (selected.length === customers.length) {
      // 如果已全選，則取消全選
      onSelectedChange([]);
    } else {
      // 否則全選當前頁的客戶
      onSelectedChange(customers.map(customer => customer.id));
    }
  };

  // 處理單個客戶選擇
  const handleSelectCustomer = (id: string) => {
    if (selected.includes(id)) {
      onSelectedChange(selected.filter(selectedId => selectedId !== id));
    } else {
      onSelectedChange([...selected, id]);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches

  return (
    <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
      {/* 行動版：使用虛擬清單卡片 */}
      {isMobile ? (
        <CustomerListMobile
          allCustomers={allCustomers}
          loading={loading}
          selected={selected}
          onToggleSelect={handleSelectCustomer}
          onCustomerClick={onCustomerClick}
        />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/[0.5]">
              <th className="p-3 font-medium w-10">
                <Checkbox
                  checked={customers.length > 0 && selected.length === customers.length}
                  onCheckedChange={handleSelectAll}
                  aria-label="全選"
                />
              </th>
              <th className="p-3 font-medium text-left w-32 min-w-[120px]">客戶姓名</th>
              <th className="p-3 font-medium text-left w-32 min-w-[120px]">電話</th>
              <th className="p-3 font-medium text-left w-32 min-w-[120px]">地區</th>
              <th className="p-3 font-medium text-left">地址</th>
              <th className="p-3 font-medium text-center w-24 min-w-[80px]">購買次數</th>
              <th className="p-3 font-medium text-left">購買商品</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-4 text-center">載入中...</td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center">無客戶資料</td>
              </tr>
            ) : (
              customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="border-t hover:bg-muted/[0.2] transition-colors cursor-pointer data-[state=selected]:bg-muted"
                  onClick={() => onCustomerClick(customer)}
                >
                  <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(customer.id)}
                      onCheckedChange={() => handleSelectCustomer(customer.id)}
                      aria-label={`選擇客戶 ${customer.name}`}
                    />
                  </td>
                  <td className="p-3">{customer.name}</td>
                  <td className="p-3">{customer.phone}</td>
                  <td className="p-3">{customer.region}</td>
                  <td className="p-3 truncate max-w-[300px]" title={customer.address}>
                    {customer.address}
                  </td>
                  <td className="p-3 text-center">{customer.purchaseCount}</td>
                  <td className="p-3 truncate max-w-[300px]" title={customer.purchasedItems.join(', ')}>
                    {customer.purchasedItems.join(', ')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* 分頁控制 */}
      {!isMobile && !loading && totalPages > 1 && (
        <div className="p-4 flex justify-between items-center border-t mr-16">
          <div className="text-sm text-muted-foreground">
            顯示 {((currentPage - 1) * itemsPerPage) + 1} 至 {Math.min(currentPage * itemsPerPage, allCustomers.length)} 筆，共 {allCustomers.length} 筆
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-2 h-8"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="ml-1">上一頁</span>
            </Button>

            <div className="flex items-center gap-1">
              {/* 顯示頁碼 */}
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                // 計算頁碼顯示邏輯，最多顯示 5 個頁碼
                const pageNumbersToShow = 5;
                let startPage = Math.max(1, currentPage - Math.floor(pageNumbersToShow / 2));
                const endPage = Math.min(totalPages, startPage + pageNumbersToShow - 1);

                // 調整 startPage，確保顯示的頁碼數量是固定的
                startPage = Math.max(1, endPage - pageNumbersToShow + 1);

                const pageNumber = startPage + i;
                // 確保不超過總頁數
                if (pageNumber > totalPages) {return null;}

                return (
                  <Button
                    key={pageNumber}
                    variant={pageNumber === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNumber)}
                    className={`px-3 h-8 w-8 ${pageNumber === currentPage ? 'bg-primary text-primary-foreground' : ''}`}
                  >
                    {pageNumber}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-2 h-8"
            >
              <span className="mr-1">下一頁</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerList;
