import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';

import { CustomerFilterCriteria } from '../types/customer';
import { fetchCustomers } from '../services/customerService';

interface CustomerFiltersProps {
  onFilterChange: (filters: Partial<CustomerFilterCriteria>) => void;
}

const CustomerFilters: React.FC<CustomerFiltersProps> = ({ onFilterChange }) => {
  const [region, setRegion] = useState<string>('所有地區');
  const [purchaseCount, setPurchaseCount] = useState<string>('所有次數');
  const [purchasedItem, setPurchasedItem] = useState<string>('所有商品');
  const [search, setSearch] = useState<string>('');
  const [regions, setRegions] = useState<string[]>(['所有地區']);
  const [products, setProducts] = useState<string[]>(['所有商品']);

  // 初始化地區和商品選項
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const customers = await fetchCustomers();
        
        // 提取所有地區
        const uniqueRegions = new Set<string>();
        uniqueRegions.add('所有地區');
        customers.forEach(customer => {
          if (customer.region) {
            uniqueRegions.add(customer.region);
          }
        });
        setRegions(Array.from(uniqueRegions));
        
        // 提取所有商品
        const uniqueProducts = new Set<string>();
        uniqueProducts.add('所有商品');
        customers.forEach(customer => {
          customer.purchasedItems.forEach(item => {
            uniqueProducts.add(item);
          });
        });
        setProducts(Array.from(uniqueProducts));
      } catch (error) {
        console.error('載入篩選選項失敗:', error);
      }
    };
    
    loadFilterOptions();
  }, []);

  const handleRegionChange = (value: string) => {
    setRegion(value);
    onFilterChange({ region: value });
  };

  const handlePurchaseCountChange = (value: string) => {
    setPurchaseCount(value);
    onFilterChange({ purchaseCount: value === '所有次數' ? undefined : value });
  };

  const handlePurchasedItemChange = (value: string) => {
    setPurchasedItem(value);
    onFilterChange({ purchasedItem: value });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onFilterChange({ region, purchaseCount: purchaseCount === '所有次數' ? undefined : purchaseCount, purchasedItem, search });
  };

  return (
    <div className="p-4 mb-6 bg-card border rounded-lg shadow-sm">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 items-end">
        <Select value={region} onValueChange={handleRegionChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="所有地區" />
          </SelectTrigger>
          <SelectContent>
            {regions.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={purchaseCount} onValueChange={handlePurchaseCountChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="所有購買次數" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="所有次數">所有購買次數</SelectItem>
            <SelectItem value="1">購買 1 次</SelectItem>
            <SelectItem value="2-5">購買 2-5 次</SelectItem>
            <SelectItem value="5+">購買 5 次以上</SelectItem>
          </SelectContent>
        </Select>

        <Select value={purchasedItem} onValueChange={handlePurchasedItemChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="所有商品" />
          </SelectTrigger>
          <SelectContent>
            {products.map(p => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <form onSubmit={handleSearch} className="flex w-full col-span-1 lg:col-span-2 xl:col-span-2">
          <Input
            placeholder="搜尋客戶姓名、電話或地址"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
          <Button type="submit" variant="outline" className="ml-2 hover:bg-primary/10">
            <Search className="h-4 w-4 text-primary" />
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CustomerFilters;
