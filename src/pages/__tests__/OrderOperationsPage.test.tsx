import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OrderOperationsPage from '../OrderOperationsPage';

const managementOrderId = '2481574c-2c61-46f8-9dc2-b9162cd8fddb';
const snapshotRevision = 'a'.repeat(64);

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function page<T>(data: T[], total: number, hasMore = false, nextCursor: string | null = null, revision = snapshotRevision) {
  return {
    success: true,
    data,
    pagination: {
      version: 1,
      total,
      page_size: 50,
      has_more: hasMore,
      next_cursor: nextCursor,
      snapshot_revision: revision,
    },
  };
}

function requestUrl(input: RequestInfo | URL): URL {
  return new URL(String(input), 'https://dashboard.example.test');
}

function managementRow(id: string, createdAt: string, actor = 'QA_ACTOR') {
  return {
    id,
    order_id: managementOrderId,
    kind: 'status',
    actor,
    created_at: createdAt,
    phase: 'pending',
  };
}

function checkoutRow(orderId: string, createdAt: string, options: Partial<{
  customerName: string;
  phoneTail: string;
  customerPending: boolean;
  stockPending: boolean;
  smsState: string;
  smsReason: string;
  primaryPresent: boolean;
}> = {}) {
  return {
    order_id: orderId,
    customer_name: options.customerName ?? 'QA_CUSTOMER',
    phone_tail: options.phoneTail ?? '0000',
    created_at: createdAt,
    phase: 'order_written',
    customer_pending: options.customerPending ?? false,
    stock_pending: options.stockPending ?? false,
    sms_state: options.smsState ?? 'sent',
    sms_reason: options.smsReason ?? '',
    primary_present: options.primaryPresent ?? true,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OrderOperationsPage paged lists', () => {
  it('keeps successful sections visible when checkout first-page loading returns 503', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const { pathname } = requestUrl(input);
      if (pathname === '/api/orders/pending') {
        return jsonResponse(200, page([managementRow('management-operation-1', recent, 'QA_MANAGEMENT_STAYS_VISIBLE')], 1));
      }
      if (pathname === '/api/checkouts/pending') return jsonResponse(503, { success: false });
      if (pathname === '/api/orders/audit') {
        return jsonResponse(200, page([{
          ...managementRow('audit-entry-1', recent, 'QA_AUDIT_ACTOR'),
          before_fields: JSON.stringify({ fields: { 15: '待轉帳' } }),
          after_fields: JSON.stringify({ fields: { 15: 'QA_AUDIT_STAYS_VISIBLE' } }),
        }], 1));
      }
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);

    expect(await screen.findByText(/下單／通知載入失敗/)).toBeTruthy();
    expect(await screen.findByText(/QA_MANAGEMENT_STAYS_VISIBLE/)).toBeTruthy();
    expect(await screen.findByText(/QA_AUDIT_STAYS_VISIBLE/)).toBeTruthy();
    const summary = screen.getByTestId('operations-alert-summary');
    expect(summary.textContent).toContain('下單／通知摘要讀取失敗，暫時無法計算。');
    expect(summary.textContent).not.toContain('簡訊額度略過：0 筆');
    expect(summary.textContent).not.toContain('已完整載入管理及下單／通知清單');
    expect(screen.queryByText('目前沒有下單或通知待辦。')).toBeNull();
    expect(screen.queryByText('目前沒有待確認的管理操作。')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchMock.mock.calls) {
      const parsed = requestUrl(url);
      expect(parsed.searchParams.get('page_size')).toBe('50');
      expect(parsed.searchParams.has('cursor')).toBe(false);
      expect(options?.method ?? 'GET').toBe('GET');
    }
  });

  it('counts loaded alert categories without PII and updates at the 30-minute threshold without another request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T01:29:00.000Z'));
    const checkoutRows = [
      checkoutRow('ORDER_ID_MUST_NOT_APPEAR_IN_SUMMARY', '2026-10-02T01:00:00.000Z', {
        customerName: 'CUSTOMER_NAME_MUST_NOT_APPEAR', phoneTail: '9876', smsState: 'budget_skipped',
        smsReason: 'RAW_SMS_REASON_MUST_NOT_APPEAR',
      }),
      checkoutRow('ORDER_ID_UNCERTAIN', '2026-10-02T01:00:00.000Z', {
        customerName: 'ANOTHER_CUSTOMER', phoneTail: '1111', smsState: 'uncertain', smsReason: 'PRIVATE_REASON',
      }),
      checkoutRow('ORDER_ID_BAD_TIME', 'not-a-timestamp', { customerPending: true }),
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname } = requestUrl(input);
      if (pathname === '/api/orders/pending') {
        return jsonResponse(200, page([
          managementRow('management-operation-1', '2026-10-02T01:00:00.000Z', 'ACTOR_MUST_NOT_APPEAR_IN_SUMMARY'),
        ], 1));
      }
      if (pathname === '/api/checkouts/pending') return jsonResponse(200, page(checkoutRows, checkoutRows.length));
      if (pathname === '/api/orders/audit') return jsonResponse(200, page([], 0));
      throw new Error(`Unexpected mocked request: ${String(input)} (${init?.method || 'GET'})`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      render(<OrderOperationsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const summary = screen.getByTestId('operations-alert-summary');
    expect(summary.textContent).toContain('管理操作逾時：0 筆');
    expect(summary.textContent).toContain('下單／通知逾時：0 筆');
    expect(summary.textContent).toContain('時間待確認：1 筆');
    expect(summary.textContent).toContain('客戶同步待辦：1 筆');
    expect(summary.textContent).toContain('庫存確認待辦：0 筆');
    expect(summary.textContent).toContain('簡訊額度略過：1 筆');
    expect(summary.textContent).toContain('簡訊結果待核對：1 筆');
    for (const privateValue of [
      'ORDER_ID_MUST_NOT_APPEAR_IN_SUMMARY', 'CUSTOMER_NAME_MUST_NOT_APPEAR',
      '9876', 'RAW_SMS_REASON_MUST_NOT_APPEAR', 'ACTOR_MUST_NOT_APPEAR_IN_SUMMARY',
    ]) {
      expect(summary.textContent).not.toContain(privateValue);
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(summary.textContent).toContain('管理操作逾時：1 筆');
    expect(summary.textContent).toContain('下單／通知逾時：2 筆');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('does not treat loading or failed first pages as zero or complete', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    render(<OrderOperationsPage />);

    const summary = screen.getByTestId('operations-alert-summary');
    expect(summary.textContent).toContain('管理操作摘要載入中…');
    expect(summary.textContent).toContain('下單／通知摘要載入中…');
    expect(summary.textContent).not.toContain('0 筆');
    expect(summary.textContent).not.toContain('已完整載入管理及下單／通知清單');
    expect(screen.queryByText('目前沒有待確認的管理操作。')).toBeNull();
    expect(screen.queryByText('目前沒有下單或通知待辦。')).toBeNull();
  });

  it('loads 50 initially, completes 100 rows, then loads 101 rows over one extra page', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const managementRows = Array.from({ length: 100 }, (_, index) => managementRow(`management-${index}`, recent));
    const checkoutRows = Array.from({ length: 101 }, (_, index) => checkoutRow(`checkout-${index}`, recent));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const cursor = url.searchParams.get('cursor');
      if (url.pathname === '/api/orders/pending') {
        if (!cursor) return jsonResponse(200, page(managementRows.slice(0, 50), 100, true, 'management-page-2'));
        if (cursor === 'management-page-2') return jsonResponse(200, page(managementRows.slice(50), 100));
      }
      if (url.pathname === '/api/checkouts/pending') {
        if (!cursor) return jsonResponse(200, page(checkoutRows.slice(0, 50), 101, true, 'checkouts-page-2'));
        if (cursor === 'checkouts-page-2') return jsonResponse(200, page(checkoutRows.slice(50, 100), 101, true, 'checkouts-page-3'));
        if (cursor === 'checkouts-page-3') return jsonResponse(200, page(checkoutRows.slice(100), 101));
      }
      if (url.pathname === '/api/orders/audit') return jsonResponse(200, page([], 0));
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);
    expect(await screen.findByText('已載入 50 / 100 筆。')).toBeTruthy();
    expect(screen.getByText('已載入 50 / 101 筆。')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText('尚有未載入項目；提醒摘要目前不是全量。')).toBeTruthy();
    expect(screen.queryByText('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '載入更多管理操作' }));
    await waitFor(() => expect(screen.getByText('已載入 100 / 100 筆。')).toBeTruthy());
    expect(screen.queryByRole('button', { name: '載入更多管理操作' })).toBeNull();
    expect(screen.getByText('已載入 50 / 101 筆。')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requestUrl(fetchMock.mock.calls[3][0]).searchParams.get('cursor')).toBe('management-page-2');

    fireEvent.click(screen.getByRole('button', { name: '載入更多下單／通知' }));
    await waitFor(() => expect(screen.getByText('已載入 100 / 101 筆。')).toBeTruthy());
    expect(screen.getByRole('button', { name: '載入更多下單／通知' })).toBeTruthy();
    expect(screen.queryByText('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    fireEvent.click(screen.getByRole('button', { name: '載入更多下單／通知' }));
    await waitFor(() => expect(screen.getByText('已載入 101 / 101 筆。')).toBeTruthy());
    expect(screen.queryByRole('button', { name: '載入更多下單／通知' })).toBeNull();
    expect(screen.getByText('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(requestUrl(fetchMock.mock.calls[4][0]).searchParams.get('cursor')).toBe('checkouts-page-2');
    expect(requestUrl(fetchMock.mock.calls[5][0]).searchParams.get('cursor')).toBe('checkouts-page-3');
  }, 15_000);

  it('requires explicit refresh after an expired cursor and never auto-appends a new snapshot', async () => {
    const firstCheckoutPage = Array.from({ length: 50 }, (_, index) => checkoutRow(`checkout-${index}`, new Date().toISOString()));
    let checkoutReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const cursor = url.searchParams.get('cursor');
      if (url.pathname === '/api/orders/pending') return jsonResponse(200, page([], 0));
      if (url.pathname === '/api/orders/audit') return jsonResponse(200, page([], 0));
      if (url.pathname === '/api/checkouts/pending') {
        checkoutReads += 1;
        if (!cursor && checkoutReads === 1) return jsonResponse(200, page(firstCheckoutPage, 51, true, 'expired-page-cursor'));
        if (cursor === 'expired-page-cursor') return jsonResponse(409, { success: false, code: 'OPERATIONS_PAGE_EXPIRED' });
        if (!cursor && checkoutReads === 3) return jsonResponse(200, page([checkoutRow('fresh-row', new Date().toISOString())], 1));
      }
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);
    expect(await screen.findByRole('button', { name: '載入更多下單／通知' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '載入更多下單／通知' }));
    expect(await screen.findByText(/下單／通知的資料快照已更新，請重新讀取整份清單/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '載入更多下單／通知' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    fireEvent.click(screen.getByRole('button', { name: '重新讀取下單／通知' }));
    await waitFor(() => expect(screen.getByText('已載入 1 / 1 筆。')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const refreshUrl = requestUrl(fetchMock.mock.calls[4][0]);
    expect(refreshUrl.pathname).toBe('/api/checkouts/pending');
    expect(refreshUrl.searchParams.get('page_size')).toBe('50');
    expect(refreshUrl.searchParams.has('cursor')).toBe(false);
  });

  it('shows a safe capacity warning on the explicit 413 response and keeps loaded rows', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const firstCheckoutPage = Array.from({ length: 50 }, (_, index) => checkoutRow(`capacity-checkout-${index}`, recent));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const cursor = url.searchParams.get('cursor');
      if (url.pathname === '/api/orders/pending' || url.pathname === '/api/orders/audit') {
        return jsonResponse(200, page([], 0));
      }
      if (url.pathname === '/api/checkouts/pending' && !cursor) {
        return jsonResponse(200, page(firstCheckoutPage, 101, true, 'capacity-page-2'));
      }
      if (url.pathname === '/api/checkouts/pending' && cursor === 'capacity-page-2') {
        return jsonResponse(413, { success: false, code: 'OPERATIONS_SNAPSHOT_TOO_LARGE' });
      }
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);
    expect(await screen.findByRole('button', { name: '載入更多下單／通知' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '載入更多下單／通知' }));

    expect(await screen.findByText(/下單／通知超過安全讀取上限/)).toBeTruthy();
    expect(screen.getByText('已載入 50 / 101 筆。')).toBeTruthy();
    expect(screen.queryByText('目前沒有下單或通知待辦。')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });

  it('does not show a global all-clear while any section is loading more', async () => {
    const firstAuditRow = {
      ...managementRow('audit-row-1', new Date().toISOString()),
      before_fields: JSON.stringify({ fields: {} }),
      after_fields: JSON.stringify({ fields: {} }),
    };
    const secondAuditRow = { ...firstAuditRow, id: 'audit-row-2' };
    let resolveNextAuditPage: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.pathname === '/api/orders/pending' || url.pathname === '/api/checkouts/pending') {
        return jsonResponse(200, page([], 0));
      }
      if (url.pathname === '/api/orders/audit' && !url.searchParams.has('cursor')) {
        return jsonResponse(200, page([firstAuditRow], 2, true, 'audit-page-2'));
      }
      if (url.pathname === '/api/orders/audit' && url.searchParams.get('cursor') === 'audit-page-2') {
        return new Promise<Response>((resolve) => { resolveNextAuditPage = resolve; });
      }
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);
    expect(await screen.findByRole('button', { name: '載入更多操作紀錄' })).toBeTruthy();
    const summary = screen.getByTestId('operations-alert-summary');
    expect(summary.textContent).not.toContain('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。');

    fireEvent.click(screen.getByRole('button', { name: '載入更多操作紀錄' }));
    expect(await screen.findByText('正在載入更多…')).toBeTruthy();
    expect(summary.textContent).toContain('正在載入更多資料；提醒摘要尚未完成更新。');
    expect(summary.textContent).not.toContain('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。');

    await act(async () => {
      resolveNextAuditPage?.(jsonResponse(200, page([secondAuditRow], 2)));
    });
    expect(await screen.findByText('已載入 2 / 2 筆。')).toBeTruthy();
    expect(summary.textContent).toContain('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('shows empty states only for validated complete zero-row results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = requestUrl(input);
      if (pathname === '/api/orders/pending' || pathname === '/api/checkouts/pending' || pathname === '/api/orders/audit') {
        return jsonResponse(200, page([], 0));
      }
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);

    expect(await screen.findByText('目前沒有待確認的管理操作。')).toBeTruthy();
    expect(screen.getByText('目前沒有下單或通知待辦。')).toBeTruthy();
    expect(screen.getByText('目前沒有操作紀錄。')).toBeTruthy();
    expect(screen.getByText('已完整載入管理及下單／通知清單，目前沒有逾時或簡訊待核對事項。')).toBeTruthy();
    expect(screen.getAllByText('已載入 0 / 0 筆。')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /載入更多/ })).toBeNull();
  });

  it('uses checkout order IDs to reject duplicate rows without showing a false empty result', async () => {
    const duplicateCheckout = checkoutRow('duplicate-checkout-id', new Date().toISOString());
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = requestUrl(input);
      if (pathname === '/api/orders/pending' || pathname === '/api/orders/audit') return jsonResponse(200, page([], 0));
      if (pathname === '/api/checkouts/pending') return jsonResponse(200, page([duplicateCheckout, duplicateCheckout], 2));
      throw new Error(`Unexpected mocked request: ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<OrderOperationsPage />);

    expect(await screen.findByText(/下單／通知分頁資料不一致/)).toBeTruthy();
    expect(screen.queryByText('目前沒有下單或通知待辦。')).toBeNull();
    expect(screen.getByTestId('operations-alert-summary').textContent).toContain('下單／通知摘要分頁資料不一致');
  });
});
