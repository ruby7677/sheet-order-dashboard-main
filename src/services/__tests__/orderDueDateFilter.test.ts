import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOrderCache, fetchOrders } from '../orderService';

const rows = [
  { id: 'fixture-before', dueDate: '2026-10-06', createdAt: '2026-10-08' },
  { id: 'fixture-wednesday', dueDate: '2026/10/7', createdAt: '2026-01-01' },
  { id: 'fixture-saturday', dueDate: '2026-10-10', createdAt: '2026-01-01' },
  { id: 'fixture-sunday', dueDate: '2026-10-11', createdAt: '2026-10-08' },
  { id: 'fixture-invalid-day', dueDate: '2026-02-30', createdAt: '2026-10-08' },
  { id: 'fixture-timestamp', dueDate: '2026-10-07T00:00:00.000Z', createdAt: '2026-10-08' },
  { id: 'fixture-empty', dueDate: '', createdAt: '2026-10-08' },
].map(row => ({
  ...row,
  orderNumber: row.id,
  customerName: 'Synthetic fixture',
  customerPhone: '',
  items: [],
  amount: 0,
  deliveryTime: '',
  status: '訂單確認中',
  deliveryMethod: '宅配到府',
  deliveryAddress: '',
  paymentMethod: '銀行轉帳',
  paymentStatus: '未收費',
}));

const mockFetch = vi.fn(async () => Response.json({
  success: true,
  data: rows,
  pagination: {
    next_cursor: null,
    total: rows.length,
    page_size: 500,
    snapshot_revision: 'fixture-snapshot-revision',
  },
}));

beforeEach(() => {
  clearOrderCache();
  vi.stubEnv('TZ', 'America/Los_Angeles');
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  clearOrderCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('order due-date filtering', () => {
  it('filters inclusive Wednesday-to-Saturday delivery dates independent of host timezone', async () => {
    const range = {
      startDate: '2026/10/7',
      endDate: '2026-10-10',
    };
    const filtered = await fetchOrders({
      dateRange: range,
    }, { forceRefresh: true });

    expect(filtered.map(order => order.id)).toEqual(['fixture-wednesday', 'fixture-saturday']);
    expect(filtered.map(order => order.dueDate)).toEqual(['2026-10-07', '2026-10-10']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('keeps invalid delivery dates in the unfiltered list but excludes them from active ranges', async () => {
    const filtered = await fetchOrders({
      dateRange: { startDate: '2026-10-07', endDate: '2026-10-10' },
    }, { forceRefresh: true });
    expect(filtered.map(order => order.id)).toEqual(['fixture-wednesday', 'fixture-saturday']);

    const allOrders = await fetchOrders();
    expect(allOrders).toHaveLength(rows.length);
    expect(allOrders.find(order => order.id === 'fixture-invalid-day')?.dueDate).toBe('');
    expect(allOrders.find(order => order.id === 'fixture-timestamp')?.dueDate).toBe('');
    expect(allOrders.find(order => order.id === 'fixture-empty')?.dueDate).toBe('');
  });

  it('fails closed on invalid bounds and treats an empty dateRange as no date filter', async () => {
    const invalidBound = await fetchOrders({
      dateRange: { startDate: '2026-02-30', endDate: '2026-03-01' },
    }, { forceRefresh: true });
    expect(invalidBound).toEqual([]);

    const noBounds = await fetchOrders({ dateRange: {} });
    expect(noBounds).toHaveLength(rows.length);
  });
});
