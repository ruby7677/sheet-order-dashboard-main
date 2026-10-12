import { z } from 'zod';
import { OrderConflict, rowCells } from './OrderContract';
import type { OrderRow } from './OrderContract';

export const DEFAULT_ORDER_PAGE_SIZE = 200;
export const MAX_ORDER_PAGE_SIZE = 500;
const cursorSchema = z.object({
  v: z.literal(1),
  offset: z.number().int().min(1),
  page_size: z.number().int().min(1).max(MAX_ORDER_PAGE_SIZE),
  scope_hash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot_revision: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export interface IndexedOrderRow {
  row: OrderRow;
  /** Zero-based row index in the complete values result, including its header. */
  sheetIndex: number;
}

export interface OrderPage {
  rows: IndexedOrderRow[];
  pagination: {
    next_cursor: string | null;
    total: number;
    page_size: number;
    snapshot_revision: string;
  };
}

function failCursor(): never {
  throw new OrderConflict(400, 'INVALID_ORDER_CURSOR', '訂單分頁識別不正確，請重新載入');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function encodeCursor(value: z.infer<typeof cursorSchema>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeCursor(value: string): z.infer<typeof cursorSchema> {
  if (value.length < 1 || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return failCursor();
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const parsed = cursorSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    if (!parsed.success) return failCursor();
    return parsed.data;
  } catch {
    return failCursor();
  }
}

/**
 * The endpoint still reads the bounded full Sheet snapshot. This helper pages the
 * response and provides a revision fence; it does not claim to page Google Sheets reads.
 */
export async function paginateOrders(
  sourceSnapshot: ReadonlyArray<ReadonlyArray<unknown>>,
  visibleRows: IndexedOrderRow[],
  pageSize: number,
  cursor?: string,
): Promise<OrderPage> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_ORDER_PAGE_SIZE) {
    throw new OrderConflict(400, 'INVALID_PAGE_SIZE', '每頁筆數須為1至500');
  }

  const rows = sourceSnapshot.map(rowCells);
  const snapshotRevision = await sha256(JSON.stringify(rows));
  const scopeHash = await sha256(JSON.stringify({ resource: 'orders', sort: 'sheet-row-order', page_size: pageSize }));
  let offset = 0;

  if (cursor !== undefined) {
    const parsed = decodeCursor(cursor);
    if (parsed.page_size !== pageSize || parsed.scope_hash !== scopeHash || parsed.offset % pageSize !== 0) return failCursor();
    if (parsed.snapshot_revision !== snapshotRevision) {
      throw new OrderConflict(409, 'ORDER_PAGE_EXPIRED', '訂單資料已更新，請重新載入');
    }
    if (parsed.offset >= visibleRows.length) return failCursor();
    offset = parsed.offset;
  }

  const pageRows = visibleRows.slice(offset, offset + pageSize);
  const nextOffset = offset + pageRows.length;
  const nextCursor = nextOffset < visibleRows.length
    ? encodeCursor({ v: 1, offset: nextOffset, page_size: pageSize, scope_hash: scopeHash, snapshot_revision: snapshotRevision })
    : null;

  return {
    rows: pageRows,
    pagination: {
      next_cursor: nextCursor,
      total: visibleRows.length,
      page_size: pageSize,
      snapshot_revision: snapshotRevision,
    },
  };
}
