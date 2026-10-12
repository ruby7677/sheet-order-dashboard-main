import {webcrypto}from 'node:crypto';
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
  data: mockOrderData,
  pagination: { next_cursor: null, total: mockOrderData.length, page_size: 500, snapshot_revision: 'fixture-snapshot' },
};

const orderPage = (data: unknown[], next_cursor: string | null, total: number, snapshot_revision: string) => ({
  success: true,
  data,
  pagination: { next_cursor, total, page_size: 500, snapshot_revision },
});

const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
});

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
    test('強制重新整理會略過仍有效的快取並請求500筆同源分頁', async () => {
      await fetchOrders();
      const firstCalls = mockFetch.mock.calls.length;
      await fetchOrders(undefined, { forceRefresh: true });
      expect(mockFetch.mock.calls.length).toBe(firstCalls + 1);
      const [url, options] = mockFetch.mock.calls.at(-1)!;
      expect(url).toMatch(/^\/api\/orders\?/);
      expect(url).not.toContain('://');
      expect(new URL(String(url), 'http://localhost').searchParams.get('page_size')).toBe('500');
      expect(new URL(String(url), 'http://localhost').searchParams.has('cursor')).toBe(false);
      expect(options.credentials).toBe('same-origin');
      expect(options.cache).toBe('no-store');
    });
    test('應該成功獲取訂單列表', async () => {
      const orders = await fetchOrders();
      
      expect(orders).toHaveLength(2);
      expect(orders[0].id).toBe(mockOrderData[0].id);
      expect(orders[0].orderNumber).toBe(mockOrderData[0].orderNumber);
      expect(orders[0].customer).toEqual(mockOrderData[0].customer);
      expect(orders[0].total).toBe(mockOrderData[0].total);
    });

    test('收集全部頁面並驗證一致快照、總數及跨頁唯一識別', async () => {
      mockFetch
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[0]], 'cursor-page-2', 2, 'snapshot-1')))
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[1]], null, 2, 'snapshot-1')));

      const orders = await fetchOrders(undefined, { forceRefresh: true });

      expect(orders.map((order) => order.id)).toEqual(['1', '2']);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const secondUrl = new URL(String(mockFetch.mock.calls[1][0]), 'http://localhost');
      expect(secondUrl.searchParams.get('page_size')).toBe('500');
      expect(secondUrl.searchParams.get('cursor')).toBe('cursor-page-2');
    });

    test('只有ORDER_PAGE_EXPIRED才整組重讀一次，且不混回過期頁的資料', async () => {
      const staleRow = { ...mockOrderData[0], id: 'stale-row' };
      const freshFirst = { ...mockOrderData[0], id: 'fresh-row-1' };
      const freshSecond = { ...mockOrderData[1], id: 'fresh-row-2' };
      mockFetch
        .mockResolvedValueOnce(response(200, orderPage([staleRow], 'expired-cursor', 2, 'old-snapshot')))
        .mockResolvedValueOnce(response(409, { success: false, code: 'ORDER_PAGE_EXPIRED', message: '快照已更新' }))
        .mockResolvedValueOnce(response(200, orderPage([freshFirst, freshSecond], null, 2, 'new-snapshot')));

      const orders = await fetchOrders(undefined, { forceRefresh: true });

      expect(orders.map((order) => order.id)).toEqual(['fresh-row-1', 'fresh-row-2']);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const restartedUrl = new URL(String(mockFetch.mock.calls[2][0]), 'http://localhost');
      expect(restartedUrl.searchParams.has('cursor')).toBe(false);
    });

    test('其他409不重試，游標循環或重複訂單識別會拒絕不完整清單', async () => {
      mockFetch.mockResolvedValueOnce(response(409, { success: false, code: 'STALE_ORDER', message: '版本衝突' }));
      await expect(fetchOrders(undefined, { forceRefresh: true })).rejects.toThrow('版本衝突');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      clearOrderCache();
      mockFetch
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[0]], 'loop-cursor', 3, 'snapshot-loop')))
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[1]], 'loop-cursor', 3, 'snapshot-loop')));
      await expect(fetchOrders(undefined, { forceRefresh: true })).rejects.toThrow(/游標重複/);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      clearOrderCache();
      mockFetch
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[0]], 'duplicate-cursor', 2, 'snapshot-duplicate')))
        .mockResolvedValueOnce(response(200, orderPage([mockOrderData[0]], null, 2, 'snapshot-duplicate')));
      await expect(fetchOrders(undefined, { forceRefresh: true })).rejects.toThrow(/重複識別/);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    test('超過兩萬筆不截斷呈現', async () => {
      mockFetch.mockResolvedValueOnce(response(200, orderPage([], null, 20_001, 'snapshot-too-large')));
      await expect(fetchOrders(undefined, { forceRefresh: true })).rejects.toThrow(/20,000/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('只有非空的伺服器成交價快照會標記為已確認', async () => {
      const pricedItem = { product_id: 'radish', product: '原味蘿蔔糕', quantity: 1, price: 0, subtotal: 0 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: [
            { id: 'a7248424-352e-4b29-9d37-f83e423997ca', orderNumber: 'QA-PRICED', priced_items: [pricedItem], amount: 350 },
            { id: 'b88fd960-a4c8-4d7a-8c27-9ef11c8fc0f8', orderNumber: 'QA-UNKNOWN', priced_items: null, items: '原味蘿蔔糕 x1', amount: 350 },
            { id: 'ff9cf7d0-4567-4b54-b0d3-049cbf4d8688', orderNumber: 'QA-EMPTY', priced_items: [], items: '原味蘿蔔糕 x1', amount: 350 },
          ],
          pagination: { next_cursor: null, total: 3, page_size: 500, snapshot_revision: 'prices-snapshot' },
        }),
      });

      const orders = await fetchOrders(undefined, { forceRefresh: true });
      expect(orders.map((order) => order.unitPricesConfirmed)).toEqual([true, false, false]);
      expect(orders[0].items[0].price).toBe(0);
      expect(orders[0].unitPricesConfirmed).toBe(true);
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

  describe('updateOrderStatus',()=>{const id='12345678-1234-4123-8123-123456789abc',rev='a'.repeat(64);beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('crypto',webcrypto);});test('sends immutable order ID and displayed version',async()=>{mockFetch.mockResolvedValue({ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>({success:true,id,revision:'b'.repeat(64)})});await updateOrderStatus(id,'已抄單',rev);const [url,options]=mockFetch.mock.calls[0];expect(url).toBe('/api/orders/status');expect(options.method).toBe('PUT');expect(JSON.parse(options.body)).toMatchObject({id,status:'已抄單',expected_revision:rev});});test('preserves a transport error for reconciliation',async()=>{mockFetch.mockRejectedValue(Error('更新失敗'));await expect(updateOrderStatus(id,'已抄單',rev)).rejects.toThrow('更新失敗');});});

  describe('批次操作',()=>{const ids=['12345678-1234-4123-8123-123456789abc','23456789-1234-4123-8123-123456789abc'],rev='a'.repeat(64),snapshots=mockOrderData.map((o,i)=>({...o,id:ids[i],revision:rev}));beforeEach(()=>{sessionStorage.clear();vi.stubGlobal('crypto',webcrypto);mockFetch.mockImplementation(async(_url,options)=>({ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>({success:true,id:JSON.parse(options.body).id,revision:'b'.repeat(64)})}));});test('reports each status update outcome',async()=>{const result=await batchUpdateOrderStatus(ids,'已出貨',snapshots);expect(result.totalDeleted).toBe(2);expect(result.totalFailed).toBe(0);expect(mockFetch).toHaveBeenCalledTimes(2);});test('archives immutable orders and reports partial outcomes',async()=>{mockFetch.mockImplementationOnce(async(_url,options)=>({ok:true,headers:new Headers({'Content-Type':'application/json'}),json:async()=>({success:true,id:JSON.parse(options.body).id,revision:'b'.repeat(64)})})).mockRejectedValueOnce(Error('Fixture timeout'));const result=await batchDeleteOrders(ids,snapshots);expect(result.totalDeleted).toBe(1);expect(result.totalFailed).toBe(1);expect(result.results[1].message).toBe('Fixture timeout');});});

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
        customer: { name: '張三', phone: '+886 (9)1234-5678' } // 相同E.164身分，不同格式
      }
    ];

    test('detectDuplicateOrders 應該正確識別重複', () => {
      const allOrders = [...mockOrderData, ...duplicateOrders];
      const duplicateGroups = detectDuplicateOrders(allOrders);
      
      expect(duplicateGroups).toHaveLength(1);
      expect(duplicateGroups[0].count).toBe(3); // 三個相同電話的訂單
      expect(duplicateGroups[0].normalizedPhone).toBe('+886912345678'); // 完整E.164標準化電話
    });

    test('isOrderDuplicate 應該正確判斷', () => {
      const allOrders = [...mockOrderData, ...duplicateOrders];
      const isDuplicate = isOrderDuplicate(mockOrderData[0], allOrders);
      
      expect(isDuplicate).toBe(true); // 因為有其他相同電話的訂單
    });

    test('invalid local suffix and different country codes never merge by last-nine digits', () => {
      const invalidSuffix = { ...mockOrderData[0], id: '5', customer: { name: '張三', phone: '912345678' } };
      const foreignPhone = { ...mockOrderData[0], id: '6', customer: { name: '王五', phone: '+44912345678' } };
      expect(isOrderDuplicate(mockOrderData[0], [mockOrderData[0], invalidSuffix])).toBe(false);
      expect(isOrderDuplicate(mockOrderData[0], [mockOrderData[0], foreignPhone])).toBe(false);
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
