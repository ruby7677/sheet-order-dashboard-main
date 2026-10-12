import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizePhone } from '../orderService';
import {
  fetchCustomers,
  fetchCustomerOrders,
  clearCustomerCache,
  clearCustomerOrderCache,
  InvalidCustomerPhoneError,
  getCustomerStats,
} from '../customerService';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const validCustomerRows = [
  {
    id: 15, name: '較早姓名', phone: '0912-345-678', normalized_phone: '+886912345678',
    deliveryMethod: '宅配', address: '台北市舊址', orderTime: '2025-01-01', items: '原味蘿蔔糕 x1',
  },
  {
    id: 28, name: '較新姓名', phone: '+886 9123-456-78', normalized_phone: '+886912345678',
    deliveryMethod: '門市取貨', address: '新北市新址', orderTime: '2026-02-01', items: '芋頭粿 x1',
  },
  {
    id: 31, name: '歷史無效電話 A', phone: '912345678', normalized_phone: null,
    deliveryMethod: '', address: '台中市一號', orderTime: '2026-01-02', items: '原味蘿蔔糕 x1',
  },
  {
    id: 32, name: '歷史無效電話 B', phone: 'phone-unknown', normalized_phone: null,
    deliveryMethod: '', address: '台中市二號', orderTime: '2026-01-03', items: '芋頭粿 x1',
  },
];

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  clearCustomerCache();
  clearCustomerOrderCache();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('customer service phone identity and loading', () => {
  it('canonicalizes complete E.164 formats and leaves invalid suffixes unmatched', () => {
    expect(canonicalizePhone("'09 1234-5678")).toBe('+886912345678');
    expect(canonicalizePhone('+886 (9) 1234-5678')).toBe('+886912345678');
    expect(canonicalizePhone('886912345678')).toBe('+886912345678');
    expect(canonicalizePhone('00886-9-1234-5678')).toBe('+886912345678');
    expect(canonicalizePhone('+1 (212) 555-1212')).toBe('+12125551212');
    expect(canonicalizePhone('912345678')).toBeNull();
    expect(canonicalizePhone('+88691234567')).toBeNull();
  });

  it('keeps raw source rows while grouping valid phone aliases and isolating invalid rows', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, data: validCustomerRows }));

    const customers = await fetchCustomers(undefined, { forceRefresh: true });

    expect(customers).toHaveLength(3);
    const validGroup = customers.find((customer) => customer.normalizedPhone === '+886912345678');
    expect(validGroup).toMatchObject({
      id: 'phone:+886912345678',
      name: '較新姓名',
      phone: '+886 9123-456-78',
      purchaseCount: 2,
      purchasedItems: ['原味蘿蔔糕', '芋頭粿'],
    });
    expect(validGroup?.sourceRecords?.map((record) => record.rowId)).toEqual(['15', '28']);
    expect(validGroup?.sourceRecords?.map((record) => record.phone)).toEqual(['0912-345-678', '+886 9123-456-78']);

    const invalidRows = customers.filter((customer) => customer.normalizedPhone === null);
    expect(invalidRows.map((customer) => customer.id)).toEqual(['31', '32']);
    expect(invalidRows.map((customer) => customer.phone)).toEqual(['912345678', 'phone-unknown']);
    expect(getCustomerStats(customers).total).toBe(3);

    const fullPhoneSearch = await fetchCustomers({ search: '00886(9)1234-5678' });
    expect(fullPhoneSearch.map((customer) => customer.id)).toEqual(['phone:+886912345678']);
  });

  it('keeps the 15-second memory cache but honors force refresh and explicit invalidation', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: validCustomerRows }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: validCustomerRows.slice(0, 1) }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: validCustomerRows.slice(0, 1) }));

    await fetchCustomers();
    await fetchCustomers();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await fetchCustomers(undefined, { forceRefresh: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    clearCustomerCache();
    await fetchCustomers();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('rejects customer API failure instead of deriving a fake list from orders', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(503, { success: false }));

    await expect(fetchCustomers(undefined, { forceRefresh: true })).rejects.toThrow(/客戶資料目前無法讀取/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain('/api/get_customers_from_sheet.php');
  });

  it('queries history by canonical full phone and rejects invalid numbers without a request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { success: true, data: [{ id: 18, orderTime: '2026-01-01', items: '原味蘿蔔糕 x1' }] }));
    const history = await fetchCustomerOrders('09 1234-5678');
    expect(history).toHaveLength(1);
    const query = new URL(String(mockFetch.mock.calls[0][0]), 'http://localhost');
    expect(query.searchParams.get('phone')).toBe('+886912345678');
    expect(query.searchParams.has('nonce')).toBe(false);

    await expect(fetchCustomerOrders('912345678')).rejects.toBeInstanceOf(InvalidCustomerPhoneError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
