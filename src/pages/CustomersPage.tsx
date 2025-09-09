// Linus式客户页面 - 只处理客户逻辑
import React, { useState } from 'react';
import CustomerDashboard from '@/components/CustomerDashboard';
import CustomerFilters from '@/components/CustomerFilters';
import CustomerList from '@/components/CustomerList';
import CustomerDetail from '@/components/CustomerDetail';
import { CustomerWithStats } from '@/types/customer';
import { CustomerFilterCriteria } from '@/types/customer';

const CustomersPage: React.FC = () => {
  // 只处理客户相关状态
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithStats | null>(null);
  const [isCustomerDetailOpen, setIsCustomerDetailOpen] = useState(false);
  const [customerFilters, setCustomerFilters] = useState<CustomerFilterCriteria>({
    region: '',
    purchasedItem: '',
    search: ''
  });
  const [customerDashboardRefreshTrigger, setCustomerDashboardRefreshTrigger] = useState(0);

  const handleSelectedCustomersChange = (ids: string[]) => setSelectedCustomers(ids);

  const handleCustomerClick = (customer: CustomerWithStats) => {
    setSelectedCustomer(customer);
    setIsCustomerDetailOpen(true);
  };

  const handleCloseCustomerDetail = () => {
    setIsCustomerDetailOpen(false);
    setSelectedCustomer(null);
  };

  const refreshCustomerData = () => {
    setCustomerDashboardRefreshTrigger(prev => prev + 1);
  };

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full flex flex-col">
        <CustomerDashboard 
          refreshTrigger={customerDashboardRefreshTrigger}
          filters={customerFilters}
        />
        
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 p-4">
          <div className="flex-1 min-w-0 space-y-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-80 flex-shrink-0">
                <CustomerFilters
                  onFiltersChange={setCustomerFilters}
                  onRefresh={refreshCustomerData}
                />
              </div>
            </div>

            <CustomerList
              filters={customerFilters}
              refreshTrigger={customerDashboardRefreshTrigger}
              onSelectedChange={handleSelectedCustomersChange}
              onCustomerClick={handleCustomerClick}
              onRefreshData={refreshCustomerData}
            />
          </div>
        </div>

        {selectedCustomer && (
          <CustomerDetail
            customer={selectedCustomer}
            isOpen={isCustomerDetailOpen}
            onClose={handleCloseCustomerDetail}
            onUpdate={refreshCustomerData}
          />
        )}
      </div>
    </main>
  );
};

export default CustomersPage;