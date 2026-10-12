export const OPERATIONS_PAGE_SIZE = 50;
export const OPERATIONS_MAX_PAGE_SIZE = 100;
export const OPERATIONS_MAX_TOTAL = 20_000;
export const OPERATIONS_MAX_CURSOR_LENGTH = 1_024;

export type OperationsEndpoint =
  | '/api/orders/pending'
  | '/api/checkouts/pending'
  | '/api/orders/audit';

export interface OperationsPageMetadata {
  version: 1;
  total: number;
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
  snapshot_revision: string;
}

export interface OperationsPageState<T> {
  rows: T[];
  version: 1;
  total: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: string | null;
  snapshotRevision: string;
  requestedCursors: string[];
}

export class OperationsPaginationError extends Error {
  constructor(message: string, public readonly kind: 'request' | 'invalid') {
    super(message);
    this.name = 'OperationsPaginationError';
  }
}

export class OperationsPageExpiredError extends Error {
  constructor() {
    super('資料快照已更新或版本不一致，需重新讀取清單。');
    this.name = 'OperationsPageExpiredError';
  }
}

export class OperationsCapacityError extends Error {
  constructor() {
    super('清單已達安全讀取上限，無法完整載入。');
    this.name = 'OperationsCapacityError';
  }
}

const firstPageKey = '\u0000first-page';
const allowedEndpoints = new Set<OperationsEndpoint>([
  '/api/orders/pending',
  '/api/checkouts/pending',
  '/api/orders/audit',
]);

function invalid(message: string): never {
  throw new OperationsPaginationError(message, 'invalid');
}

function validateMetadata(value: unknown): OperationsPageMetadata {
  if (!value || typeof value !== 'object') return invalid('分頁資訊缺失');
  const metadata = value as Partial<OperationsPageMetadata>;
  if (metadata.version !== 1) return invalid('分頁版本不支援');
  if (!Number.isSafeInteger(metadata.total) || (metadata.total ?? -1) < 0) return invalid('總筆數無效');
  if ((metadata.total ?? 0) > OPERATIONS_MAX_TOTAL) throw new OperationsCapacityError();
  if (metadata.page_size !== OPERATIONS_PAGE_SIZE || metadata.page_size > OPERATIONS_MAX_PAGE_SIZE) {
    return invalid('分頁大小不符');
  }
  if (typeof metadata.has_more !== 'boolean') return invalid('分頁狀態無效');
  if (metadata.has_more ? (typeof metadata.next_cursor !== 'string' || !metadata.next_cursor.trim() || metadata.next_cursor.length > OPERATIONS_MAX_CURSOR_LENGTH) : metadata.next_cursor !== null) {
    return invalid('分頁游標與剩餘資料狀態不符');
  }
  if (typeof metadata.snapshot_revision !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.snapshot_revision)) {
    return invalid('快照版本格式無效');
  }
  return metadata as OperationsPageMetadata;
}

/** Fetch exactly one page and append it only after the full pagination contract is validated. */
export async function loadOperationsPage<T>(
  endpoint: OperationsEndpoint,
  identify: (row: T) => string,
  previous: OperationsPageState<T> | null = null,
): Promise<OperationsPageState<T>> {
  if (!allowedEndpoints.has(endpoint)) throw new OperationsPaginationError('清單路徑無效', 'request');
  if (previous && (!previous.hasMore || previous.nextCursor === null)) {
    throw new OperationsPaginationError('清單已載入完畢', 'request');
  }

  const cursor = previous?.nextCursor ?? null;
  const cursorKey = cursor ?? firstPageKey;
  if (previous?.requestedCursors.includes(cursorKey)) {
    return invalid('分頁游標重複，請重新讀取清單');
  }

  const params = new URLSearchParams({ page_size: String(OPERATIONS_PAGE_SIZE) });
  if (cursor !== null) params.set('cursor', cursor);

  let response: Response;
  try {
    response = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new OperationsPaginationError('清單讀取失敗', 'request');
  }

  if (!response.ok) {
    let errorBody: { code?: unknown } = {};
    try {
      errorBody = await response.json() as { code?: unknown };
    } catch {
      // Do not expose untrusted error bodies in the operations UI.
    }
    if (response.status === 409 && errorBody.code === 'OPERATIONS_PAGE_EXPIRED') {
      throw new OperationsPageExpiredError();
    }
    if (response.status === 413 && errorBody.code === 'OPERATIONS_SNAPSHOT_TOO_LARGE') {
      throw new OperationsCapacityError();
    }
    throw new OperationsPaginationError('清單讀取失敗', 'request');
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    return invalid('清單回應格式無效');
  }
  if (!result || typeof result !== 'object' || (result as { success?: unknown }).success !== true) {
    return invalid('清單回應格式無效');
  }

  const payload = result as { data?: unknown; pagination?: unknown };
  if (!Array.isArray(payload.data)) return invalid('清單資料格式無效');
  const metadata = validateMetadata(payload.pagination);
  if (payload.data.length > metadata.page_size) return invalid('單頁筆數超出上限');

  if (previous && (
    metadata.version !== previous.version
    || metadata.total !== previous.total
    || metadata.page_size !== previous.pageSize
    || metadata.snapshot_revision !== previous.snapshotRevision
  )) {
    throw new OperationsPageExpiredError();
  }

  const rows = [...(previous?.rows ?? []), ...(payload.data as T[])];
  if (rows.length > metadata.total) return invalid('已載入筆數超過總筆數');

  const identities = new Set<string>();
  for (const row of rows) {
    let id: unknown;
    try {
      id = identify(row);
    } catch {
      return invalid('清單項目識別無效');
    }
    if (typeof id !== 'string' || !id.trim()) return invalid('清單項目識別無效');
    if (identities.has(id)) return invalid('分頁包含重複項目，請重新讀取清單');
    identities.add(id);
  }

  if (metadata.has_more) {
    if (payload.data.length === 0 || rows.length >= metadata.total) return invalid('分頁剩餘筆數不一致');
    if (previous?.requestedCursors.includes(metadata.next_cursor as string) || metadata.next_cursor === cursor) {
      return invalid('分頁游標循環，請重新讀取清單');
    }
  } else if (rows.length !== metadata.total) {
    return invalid('清單尚未完整載入，請重新讀取');
  }

  return {
    rows,
    version: metadata.version,
    total: metadata.total,
    pageSize: metadata.page_size,
    hasMore: metadata.has_more,
    nextCursor: metadata.next_cursor,
    snapshotRevision: metadata.snapshot_revision,
    requestedCursors: [...(previous?.requestedCursors ?? []), cursorKey],
  };
}
