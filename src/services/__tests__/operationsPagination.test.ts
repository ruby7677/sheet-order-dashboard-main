import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadOperationsPage,
  OperationsCapacityError,
  OperationsPageExpiredError,
  OPERATIONS_PAGE_SIZE,
} from '../operationsPagination';

const revision = 'a'.repeat(64);
const jsonResponse = (status: number, payload: unknown): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(payload),
} as unknown as Response);

function payload<T>(data: T[], total: number, hasMore: boolean, nextCursor: string | null, snapshotRevision = revision) {
  return {
    success: true,
    data,
    pagination: {
      version: 1,
      total,
      page_size: OPERATIONS_PAGE_SIZE,
      has_more: hasMore,
      next_cursor: nextCursor,
      snapshot_revision: snapshotRevision,
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('operations pagination', () => {
  it('requests only the first 50 rows and validates a complete short result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, payload([{ id: 'row-1' }], 1, false, null)));
    vi.stubGlobal('fetch', fetchMock);

    const state = await loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/orders/pending?page_size=50');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
    });
    expect(state).toMatchObject({ rows: [{ id: 'row-1' }], total: 1, hasMore: false, nextCursor: null });
  });

  it('appends pages from the same snapshot and sends the next cursor', async () => {
    const firstRows = Array.from({ length: 50 }, (_, index) => ({ id: `row-${index}` }));
    const lastRow = { id: 'row-50' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, payload(firstRows, 51, true, 'cursor-2')))
      .mockResolvedValueOnce(jsonResponse(200, payload([lastRow], 51, false, null)));
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadOperationsPage('/api/orders/audit', (row: { id: string }) => row.id);
    const second = await loadOperationsPage('/api/orders/audit', (row: { id: string }) => row.id, first);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/orders/audit?page_size=50&cursor=cursor-2');
    expect(second.rows).toHaveLength(51);
    expect(second).toMatchObject({ total: 51, hasMore: false, nextCursor: null, snapshotRevision: revision });
  });

  it('rejects inconsistent metadata, malformed revisions and unreasonable pages', async () => {
    const malformedResponses = [
      payload([{ id: 'row-1' }], 1, true, null),
      payload([{ id: 'row-1' }], 1, false, null, 'not-a-revision'),
      payload([{ id: 'row-1' }], 1, true, 'c'.repeat(1_025)),
      {
        ...payload([{ id: 'row-1' }], 1, false, null),
        pagination: { ...payload([{ id: 'row-1' }], 1, false, null).pagination, page_size: 101 },
      },
      payload([{ id: 'row-1' }, { id: 'row-2' }], 1, false, null),
    ];

    for (const malformed of malformedResponses) {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, malformed));
      vi.stubGlobal('fetch', fetchMock);
      await expect(loadOperationsPage('/api/checkouts/pending', (row: { id: string }) => row.id)).rejects.toThrow();
    }
  });

  it('treats a changed snapshot as expired, and rejects duplicate row IDs and repeated cursors', async () => {
    const firstRows = Array.from({ length: 50 }, (_, index) => ({ id: `row-${index}` }));
    const changedFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, payload(firstRows, 51, true, 'cursor-2')))
      .mockResolvedValueOnce(jsonResponse(200, payload([{ id: 'row-50' }], 51, false, null, 'b'.repeat(64))));
    vi.stubGlobal('fetch', changedFetch);
    const first = await loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id);
    await expect(loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id, first))
      .rejects.toBeInstanceOf(OperationsPageExpiredError);

    const duplicateFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, payload(firstRows, 51, true, 'cursor-2')))
      .mockResolvedValueOnce(jsonResponse(200, payload([{ id: 'row-1' }], 51, false, null)));
    vi.stubGlobal('fetch', duplicateFetch);
    const duplicateFirst = await loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id);
    await expect(loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id, duplicateFirst)).rejects.toThrow(/重複項目/);

    const loopFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(200, payload(firstRows, 101, true, 'cursor-2')))
      .mockResolvedValueOnce(jsonResponse(200, payload(Array.from({ length: 50 }, (_, index) => ({ id: `page2-${index}` })), 101, true, 'cursor-2')));
    vi.stubGlobal('fetch', loopFetch);
    const loopFirst = await loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id);
    await expect(loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id, loopFirst)).rejects.toThrow(/游標循環/);
  });

  it('surfaces an expired cursor as a distinct error without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(409, {
      success: false,
      code: 'OPERATIONS_PAGE_EXPIRED',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadOperationsPage('/api/orders/pending', (row: { id: string }) => row.id))
      .rejects.toBeInstanceOf(OperationsPageExpiredError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces the 20,000-row metadata cap and classifies explicit 413 separately', async () => {
    const oversizedTotalFetch = vi.fn().mockResolvedValue(jsonResponse(200, payload([], 20_001, false, null)));
    vi.stubGlobal('fetch', oversizedTotalFetch);
    await expect(loadOperationsPage('/api/orders/audit', (row: { id: string }) => row.id))
      .rejects.toBeInstanceOf(OperationsCapacityError);

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(413, {
      success: false,
      code: 'OPERATIONS_SNAPSHOT_TOO_LARGE',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadOperationsPage('/api/orders/audit', (row: { id: string }) => row.id))
      .rejects.toBeInstanceOf(OperationsCapacityError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
