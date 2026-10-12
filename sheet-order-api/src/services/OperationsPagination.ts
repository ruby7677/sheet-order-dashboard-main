import { OrderConflict } from './OrderContract';

export type OperationsListKind = 'pending' | 'audit' | 'checkouts';

export const DEFAULT_OPERATIONS_PAGE_SIZE = 50;
export const MAX_OPERATIONS_PAGE_SIZE = 100;
export const MAX_OPERATIONS_SNAPSHOT_ROWS = 20_000;
export const MAX_OPERATIONS_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_OPERATIONS_CURSOR_LENGTH = 1024;
export const OPERATIONS_PAGINATION_ERROR_STATUSES = {
  OPERATIONS_PAGE_CURSOR_INVALID: 400,
  OPERATIONS_PAGE_REQUEST_INVALID: 400,
  OPERATIONS_PAGE_EXPIRED: 409,
  OPERATIONS_RELOAD_REQUIRED: 409,
  OPERATIONS_SNAPSHOT_CORRUPT: 409,
  OPERATIONS_SNAPSHOT_TOO_LARGE: 413,
} as const;

export type OperationsPaginationErrorCode = keyof typeof OPERATIONS_PAGINATION_ERROR_STATUSES;

const operationsErrorMessages: Record<OperationsPaginationErrorCode, string> = {
  OPERATIONS_PAGE_CURSOR_INVALID: '待辦分頁識別不正確，請重新載入',
  OPERATIONS_PAGE_REQUEST_INVALID: '待辦分頁參數不正確',
  OPERATIONS_PAGE_EXPIRED: '待辦清單已更新，請重新載入',
  OPERATIONS_RELOAD_REQUIRED: '待辦清單超過舊版讀取上限，請重新載入',
  OPERATIONS_SNAPSHOT_CORRUPT: '待辦資料格式需核對，請重新載入',
  OPERATIONS_SNAPSHOT_TOO_LARGE: '待辦清單超出安全讀取範圍，請重新載入',
};

export function safeOperationsPaginationError(code: unknown, status: number): {
  code: OperationsPaginationErrorCode;
  status: 400 | 409 | 413;
  message: string;
} | null {
  if (typeof code !== 'string' || !Object.hasOwn(OPERATIONS_PAGINATION_ERROR_STATUSES, code)) return null;
  const safeCode = code as OperationsPaginationErrorCode;
  if (OPERATIONS_PAGINATION_ERROR_STATUSES[safeCode] !== status) return null;
  return { code: safeCode, status: status as 400 | 409 | 413, message: operationsErrorMessages[safeCode] };
}

interface OperationsCursor {
  version: 1;
  offset: number;
  page_size: number;
  scope_hash: string;
  snapshot_revision: string;
}

export interface OperationsPagination {
  version: 1;
  total: number;
  page_size: number;
  has_more: boolean;
  next_cursor: string | null;
  snapshot_revision: string;
}

export interface OperationsPage<T> {
  rows: T[];
  pagination: OperationsPagination;
}

export interface OperationsPageEnvelope<T> {
  items: T[];
  pagination: OperationsPagination;
}

export interface OperationsPageQuery {
  paginated: boolean;
  pageSize: number;
  cursor?: string;
}

export interface OperationsPageScope {
  kind: OperationsListKind;
  actor: string;
}

const hash = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

function failCursor(): never {
  throw new OrderConflict(400, 'OPERATIONS_PAGE_CURSOR_INVALID', operationsErrorMessages.OPERATIONS_PAGE_CURSOR_INVALID);
}

function failPageSize(): never {
  throw new OrderConflict(400, 'OPERATIONS_PAGE_REQUEST_INVALID', '每頁筆數須為 1 至 100');
}

function failPage(): never {
  throw new OrderConflict(503, 'OPERATIONS_PAGE_INVALID', '待辦分頁回應格式不正確');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function parseCursor(value: string): OperationsCursor {
  if (value.length < 1 || value.length > MAX_OPERATIONS_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return failCursor();
  }
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    if (
      !isRecord(parsed)
      || !hasExactKeys(parsed, ['version', 'offset', 'page_size', 'scope_hash', 'snapshot_revision'])
      || parsed.version !== 1
      || !Number.isSafeInteger(parsed.offset)
      || (parsed.offset as number) < 1
      || (parsed.offset as number) > MAX_OPERATIONS_SNAPSHOT_ROWS
      || !Number.isSafeInteger(parsed.page_size)
      || (parsed.page_size as number) < 1
      || (parsed.page_size as number) > MAX_OPERATIONS_PAGE_SIZE
      || typeof parsed.scope_hash !== 'string'
      || !/^[a-f0-9]{64}$/.test(parsed.scope_hash)
      || typeof parsed.snapshot_revision !== 'string'
      || !/^[a-f0-9]{64}$/.test(parsed.snapshot_revision)
    ) return failCursor();
    return parsed as unknown as OperationsCursor;
  } catch {
    return failCursor();
  }
}

function encodeCursor(value: OperationsCursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function parseOperationsPageQuery(params: URLSearchParams): OperationsPageQuery {
  const keys = [...params.keys()];
  if (keys.some(key => key !== 'page_size' && key !== 'cursor') || new Set(keys).size !== keys.length) {
    throw new OrderConflict(400, 'OPERATIONS_PAGE_REQUEST_INVALID', operationsErrorMessages.OPERATIONS_PAGE_REQUEST_INVALID);
  }
  const paginated = params.has('page_size') || params.has('cursor');
  const rawPageSize = params.get('page_size');
  let pageSize = DEFAULT_OPERATIONS_PAGE_SIZE;
  if (rawPageSize !== null) {
    if (!/^\d{1,3}$/.test(rawPageSize)) return failPageSize();
    pageSize = Number(rawPageSize);
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_OPERATIONS_PAGE_SIZE) return failPageSize();
  }
  const rawCursor = params.get('cursor');
  if (rawCursor !== null) validateOperationsPageCursor(rawCursor, pageSize);
  return { paginated, pageSize, ...(rawCursor !== null ? { cursor: rawCursor } : {}) };
}

export function validateOperationsPageCursor(value: string, pageSize?: number): void {
  const parsed = parseCursor(value);
  if (pageSize !== undefined && parsed.page_size !== pageSize) return failCursor();
}

export async function validateOperationsPageCursorScope(
  value: string,
  pageSize: number,
  kind: OperationsListKind,
  actor: string,
): Promise<void> {
  validateOperationsPageCursor(value, pageSize);
  const parsed = parseCursor(value);
  const expected = await hash(JSON.stringify({ kind, actor: actor.trim().toLowerCase() }));
  if (parsed.scope_hash !== expected) return failCursor();
}

export async function paginateOperationsSnapshot<T>(
  kind: OperationsListKind,
  actor: string,
  rows: ReadonlyArray<T>,
  pageSize = DEFAULT_OPERATIONS_PAGE_SIZE,
  cursor?: string,
): Promise<OperationsPage<T>> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_OPERATIONS_PAGE_SIZE) return failPageSize();
  if (cursor !== undefined) parseCursor(cursor);

  let serialized: string;
  try {
    serialized = JSON.stringify(rows);
    if (typeof serialized !== 'string') throw new Error('Snapshot is not serializable');
  } catch {
    throw new OrderConflict(409, 'OPERATIONS_SNAPSHOT_CORRUPT', operationsErrorMessages.OPERATIONS_SNAPSHOT_CORRUPT);
  }
  const snapshotBytes = new TextEncoder().encode(serialized).byteLength;
  if (rows.length > MAX_OPERATIONS_SNAPSHOT_ROWS || snapshotBytes > MAX_OPERATIONS_SNAPSHOT_BYTES) {
    if (cursor !== undefined) {
      throw new OrderConflict(409, 'OPERATIONS_PAGE_EXPIRED', '待辦清單已更新，請重新載入');
    }
    throw new OrderConflict(413, 'OPERATIONS_SNAPSHOT_TOO_LARGE', operationsErrorMessages.OPERATIONS_SNAPSHOT_TOO_LARGE);
  }

  const [snapshotRevision, scopeHash] = await Promise.all([
    hash(serialized),
    hash(JSON.stringify({ kind, actor: actor.trim().toLowerCase() })),
  ]);
  let offset = 0;
  if (cursor !== undefined) {
    const decoded = parseCursor(cursor);
    if (decoded.page_size !== pageSize || decoded.scope_hash !== scopeHash || decoded.offset % pageSize !== 0) {
      return failCursor();
    }
    if (decoded.snapshot_revision !== snapshotRevision) {
      throw new OrderConflict(409, 'OPERATIONS_PAGE_EXPIRED', '待辦清單已更新，請重新載入');
    }
    if (decoded.offset >= rows.length) return failCursor();
    offset = decoded.offset;
  }

  const pageRows = rows.slice(offset, offset + pageSize);
  const nextOffset = offset + pageRows.length;
  const hasMore = nextOffset < rows.length;
  const nextCursor = hasMore
    ? encodeCursor({
      version: 1,
      offset: nextOffset,
      page_size: pageSize,
      scope_hash: scopeHash,
      snapshot_revision: snapshotRevision,
    })
    : null;

  return {
    rows: [...pageRows],
    pagination: {
      version: 1,
      total: rows.length,
      page_size: pageSize,
      has_more: hasMore,
      next_cursor: nextCursor,
      snapshot_revision: snapshotRevision,
    },
  };
}

export async function validateOperationsPageEnvelope<T>(
  value: unknown,
  requestedPageSize: number,
  expectedScope?: OperationsPageScope,
): Promise<OperationsPageEnvelope<T>> {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'pagination']) || !Array.isArray(value.items)) return failPage();
  const pagination = value.pagination;
  if (
    !isRecord(pagination)
    || !hasExactKeys(pagination, ['version', 'total', 'page_size', 'has_more', 'next_cursor', 'snapshot_revision'])
    || pagination.version !== 1
    || !Number.isSafeInteger(pagination.total)
    || (pagination.total as number) < 0
    || (pagination.total as number) > MAX_OPERATIONS_SNAPSHOT_ROWS
    || pagination.page_size !== requestedPageSize
    || !Number.isSafeInteger(pagination.page_size)
    || (pagination.page_size as number) < 1
    || (pagination.page_size as number) > MAX_OPERATIONS_PAGE_SIZE
    || typeof pagination.has_more !== 'boolean'
    || (pagination.next_cursor !== null && typeof pagination.next_cursor !== 'string')
    || typeof pagination.snapshot_revision !== 'string'
    || !/^[a-f0-9]{64}$/.test(pagination.snapshot_revision)
  ) return failPage();

  const nextCursor = pagination.next_cursor as string | null;
  if (
    value.items.length > requestedPageSize
    || value.items.length > (pagination.total as number)
    || (value.items.length === 0 && pagination.total !== 0)
    || pagination.has_more !== (nextCursor !== null)
    || (pagination.has_more && value.items.length === 0)
  ) return failPage();

  if (nextCursor !== null) {
    let decoded: OperationsCursor;
    try {
      decoded = parseCursor(nextCursor);
    } catch {
      return failPage();
    }
    if (
      decoded.page_size !== requestedPageSize
      || decoded.snapshot_revision !== pagination.snapshot_revision
      || decoded.offset >= (pagination.total as number)
    ) return failPage();
    if (expectedScope) {
      const expectedScopeHash = await hash(JSON.stringify({
        kind: expectedScope.kind,
        actor: expectedScope.actor.trim().toLowerCase(),
      }));
      if (decoded.scope_hash !== expectedScopeHash) return failPage();
    }
  }

  const responseBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (responseBytes > MAX_OPERATIONS_SNAPSHOT_BYTES) return failPage();

  return {
    items: value.items as T[],
    pagination: pagination as unknown as OperationsPagination,
  };
}
