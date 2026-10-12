import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOrderCache, fetchOrders } from '../orderService';

beforeEach(() => clearOrderCache());
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('Sheets-only order source', () => {
  it('uses the Sheets API and preserves its customer and amount fields', async () => {
    localStorage.setItem('data_source', 'retired-backend');
    const request = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ success: true, data: [{
        id: 1, orderNumber: 'ORD-TEST-1', customerName: '測試顧客', customerPhone: '0912345678',
        items: '原味蘿蔔糕 x 1', amount: '100', createdAt: '2026-09-30 12:00:00',
        dueDate: '2026-10-01', status: '訂單確認中', paymentStatus: '未收費',
        deliveryMethod: '宅配到府', deliveryAddress: '測試地址',
      }], pagination: { next_cursor: null, total: 1, page_size: 500, snapshot_revision: 'fixture-snapshot' } }),
    });
    vi.stubGlobal('fetch', request);
    const orders = await fetchOrders(undefined, { forceRefresh: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toContain('/api/orders');
    expect(orders).toHaveLength(1);
    expect(orders[0].customer.name).toBe('測試顧客');
    expect(orders[0].customer.phone).toBe('0912345678');
    expect(orders[0].total).toBe(100);
    expect(orders[0].status).toBe('訂單確認中');
  });
});
