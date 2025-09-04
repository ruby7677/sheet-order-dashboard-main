import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  fetchOrders, 
  fetchOrderById, 
  fetchOrderStats,
  updateOrderStatus,
  updateOrderPaymentStatus,
  updateOrderItems,
  deleteOrder,
  batchDeleteOrders,
  batchUpdateOrderStatus,
  batchUpdateOrderPaymentStatus,
  clearOrderCache,
  detectDuplicateOrders,
  isOrderDuplicate,
  generatePrintData,
  exportToCsv,
  getDataSource,
  setDataSource
} from '../orderService';
import type { Order, OrderItem } from '@/types/order';

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
    port: '8080',
    protocol: 'http:'
  },
  writable: true
});

// Test data
const mockOrderData: Order[] = [
  {
    id: '1',
    orderNumber: 'ORD-001',
    customer: { name: '張三', phone: '0912345678' },
    items: [
      { product: '原味蘿蔔糕', quantity: 2, price: 250, subtotal: 500 }
    ],
    total: 500,
    status: '訂單確認中',
    createdAt: '2025-01-01',
    deliveryMethod: '宅配',
    deliveryAddress: '台北市中正區',
    dueDate: '2025-01-15',
    deliveryTime: '下午',
    paymentMethod: '銀行轉帳',
    notes: '測試訂單',
    paymentStatus: '未收費'
  },
  {
    id: '2', 
    orderNumber: 'ORD-002',
    customer: { name: '李四', phone: '0987654321' },
    items: [
      { product: '芋頭粿', quantity: 1, price: 350, subtotal: 350 }
    ],
    total: 350,
    status: '已抄單',
    createdAt: '2025-01-02',
    deliveryMethod: '自取',
    deliveryAddress: '',
    dueDate: '2025-01-16',
    deliveryTime: '上午',
    paymentMethod: '現金',
    notes: '',
    paymentStatus: '已收費'
  }
];

const mockApiResponse = {
  success: true,
  data: mockOrderData
};

describe('OrderService', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    clearOrderCache();
    localStorageMock.getItem.mockReturnValue('sheets');
    
    // Mock successful fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockApiResponse)
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchOrders', () => {
    test('應該成功獲取訂單列表', async () => {
      const orders = await fetchOrders();
      
      expect(orders).toHaveLength(2);
      expect(orders[0].id).toBe(mockOrderData[0].id);
      expect(orders[0].orderNumber).toBe(mockOrderData[0].orderNumber);
      expect(orders[0].customer).toEqual(mockOrderData[0].customer);
      expect(orders[0].total).toBe(mockOrderData[0].total);
    });

    test('應該正確處理篩選條件', async () => {
      const orders = await fetchOrders({ status: '訂單確認中' });
      
      // 應該調用 API
      expect(mockFetch).toHaveBeenCalled();
      
      // 前端篩選應該只返回符合條件的訂單
      const filteredOrders = orders.filter(o => o.status === '訂單確認中');
      expect(filteredOrders).toHaveLength(1);
      expect(filteredOrders[0].id).toBe('1');
    });

    test('應該正確處理搜尋功能', async () => {
      const orders = await fetchOrders({ search: '張三' });
      
      expect(orders).toBeDefined();
      expect(Array.isArray(orders)).toBe(true);
    });

    test('應該正確處理 API 錯誤', async () => {
      // Mock 所有的 API 端點都失敗
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrders()).rejects.toThrow();
    });

    test('應該正確處理網路錯誤', async () => {
      // Mock 所有的 API 端點都失敗
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchOrders()).rejects.toThrow('Network error');
    });
  });

  describe('fetchOrderById', () => {
    test('應該成功根據ID獲取訂單', async () => {
      const order = await fetchOrderById('1');
      
      expect(order).not.toBeNull();
      expect(order?.id).toBe('1');
      expect(order?.orderNumber).toBe('ORD-001');
    });

    test('找不到訂單時應該返回null', async () => {
      const order = await fetchOrderById('999');
      
      expect(order).toBeNull();
    });
  });

  describe('fetchOrderStats', () => {
    test('應該正確計算訂單統計', async () => {
      const stats = await fetchOrderStats();
      
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1); // 訂單確認中
      expect(stats.processing).toBe(1); // 已抄單
      expect(stats.completed).toBe(0);
      expect(stats.canceled).toBe(0);
      expect(stats.unpaid).toBe(1); // 未收費的訂單
      expect(stats.totalAmount).toBe(850); // 500 + 350
    });
  });

  describe('updateOrderStatus', () => {
    test('應該成功更新訂單狀態', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true })
      });

      await expect(updateOrderStatus('1', '已抄單')).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('update_order_status.php'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"id":"1"')
        })
      );
    });

    test('API 失敗時應該拋出錯誤', async () => {
      mockFetch.mockRejectedValue(new Error('更新失敗'));

      await expect(updateOrderStatus('1', '已抄單')).rejects.toThrow('更新失敗');
    });
  });

  describe('批次操作', () => {
    test('batchUpdateOrderStatus 應該成功', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true })
      });

      const ids = ['1', '2'];
      await expect(batchUpdateOrderStatus(ids, '已出貨')).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(2); // 每個 ID 一次調用
    });

    test('batchDeleteOrders 應該處理批次刪除', async () => {
      const mockBatchResponse = {
        success: true,
        results: [
          { id: '1', success: true, message: '刪除成功', orderNumber: 'ORD-001' },
          { id: '2', success: true, message: '刪除成功', orderNumber: 'ORD-002' }
        ],
        totalDeleted: 2,
        totalFailed: 0
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockBatchResponse)
      });

      const result = await batchDeleteOrders(['1', '2']);
      expect(result.success).toBe(true);
      expect(result.totalDeleted).toBe(2);
      expect(result.totalFailed).toBe(0);
    });
  });

  describe('重複訂單檢測', () => {
    const duplicateOrders: Order[] = [
      {
        ...mockOrderData[0],
        id: '3',
        customer: { name: '張三', phone: '0912-345-678' } // 相同電話，不同格式
      },
      {
        ...mockOrderData[0],
        id: '4', 
        customer: { name: '張三', phone: '912345678' } // 相同電話，省略0
      }
    ];

    test('detectDuplicateOrders 應該正確識別重複', () => {
      const allOrders = [...mockOrderData, ...duplicateOrders];
      const duplicateGroups = detectDuplicateOrders(allOrders);
      
      expect(duplicateGroups).toHaveLength(1);
      expect(duplicateGroups[0].count).toBe(3); // 三個相同電話的訂單
      expect(duplicateGroups[0].normalizedPhone).toBe('912345678'); // 標準化後的電話
    });

    test('isOrderDuplicate 應該正確判斷', () => {
      const allOrders = [...mockOrderData, ...duplicateOrders];
      const isDuplicate = isOrderDuplicate(mockOrderData[0], allOrders);
      
      expect(isDuplicate).toBe(true); // 因為有其他相同電話的訂單
    });
  });

  describe('資料來源管理', () => {
    test('getDataSource 應該返回正確的資料來源', () => {
      localStorageMock.getItem.mockReturnValue('supabase');
      expect(getDataSource()).toBe('supabase');
      
      localStorageMock.getItem.mockReturnValue('sheets');
      expect(getDataSource()).toBe('sheets');
      
      localStorageMock.getItem.mockReturnValue(null);
      expect(getDataSource()).toBe('sheets'); // 預設值
    });

    test('setDataSource 應該設置資料來源', () => {
      setDataSource('supabase');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('data_source', 'supabase');
    });
  });

  describe('匯出功能', () => {
    test('generatePrintData 應該正確轉換資料', () => {
      const printData = generatePrintData(mockOrderData);
      
      expect(printData).toHaveLength(2);
      expect(printData[0]).toEqual({
        orderNumber: 'ORD-001',
        customerName: '張三',
        customerPhone: '0912345678',
        items: '原味蘿蔔糕 x 2',
        total: 500,
        deliveryMethod: '宅配',
        deliveryAddress: '台北市中正區',
        dueDate: '2025-01-15',
        deliveryTime: '下午',
        paymentMethod: '銀行轉帳',
        notes: '測試訂單'
      });
    });

    test('exportToCsv 應該生成正確的CSV格式', () => {
      const csvContent = exportToCsv(mockOrderData);
      
      expect(csvContent).toContain('A001'); // 自動生成的訂單編號
      expect(csvContent).toContain('張三'); // 客戶姓名
      expect(csvContent).toContain('台北市中正區'); // 地址
      expect(typeof csvContent).toBe('string');
      expect(csvContent.length).toBeGreaterThan(0);
    });
  });
});