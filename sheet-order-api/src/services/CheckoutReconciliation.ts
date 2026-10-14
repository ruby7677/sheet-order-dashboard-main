import { OrderConflict } from './OrderContract';
import { safeOperationsPaginationError, validateOperationsPageCursorScope, validateOperationsPageEnvelope } from './OperationsPagination';

const endpoint = 'https://lopokao.767780.xyz/api/order_reconciliation.php';
const path = '/api/order_reconciliation.php';
const allowedActors = new Set(['ruby7677@gmail.com', 'wade7616@gmail.com']);
const maxResponseBytes = 65_536;

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');

export async function checkoutReconciliation(
  secret: string | undefined,
  actor: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  if (!allowedActors.has(actor)) {
    throw new OrderConflict(403, 'RECONCILIATION_ACTOR_FORBIDDEN', '管理員不允許');
  }
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new OrderConflict(503, 'RECONCILIATION_NOT_CONFIGURED', '下單對帳服務尚未配置');
  }
  let pageSize = 50;
  if (input.action === 'list_page') {
    if (input.page_size !== undefined) {
      if (!Number.isSafeInteger(input.page_size) || (input.page_size as number) < 1 || (input.page_size as number) > 100) {
        throw new OrderConflict(400, 'OPERATIONS_PAGE_REQUEST_INVALID', '待辦分頁參數不正確');
      }
      pageSize = input.page_size as number;
    }
    if (input.cursor !== undefined) {
      if (typeof input.cursor !== 'string') throw new OrderConflict(400, 'OPERATIONS_PAGE_REQUEST_INVALID', '待辦分頁參數不正確');
      try {
        await validateOperationsPageCursorScope(input.cursor, pageSize, 'checkouts', actor);
      } catch {
        throw new OrderConflict(400, 'OPERATIONS_PAGE_CURSOR_INVALID', '待辦分頁識別不正確，請重新載入');
      }
    }
  }

  const body = JSON.stringify({ ...input, actor });
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(body);
  if (bodyBytes.byteLength > maxResponseBytes) {
    throw new OrderConflict(413, 'RECONCILIATION_REQUEST_TOO_LARGE', '對帳請求超過安全範圍');
  }

  const time = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID().replaceAll('-', '');
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signed = ['POST', path, time, nonce, bodyHash].join('\n');
  const signature = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(signed)));

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Time': time,
        'X-Service-Nonce': nonce,
        'X-Service-Signature': signature,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new OrderConflict(503, 'RECONCILIATION_UNAVAILABLE', '對帳服務暫時無法使用');
  }

  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => undefined);
    throw new OrderConflict(503, 'RECONCILIATION_REDIRECT_REJECTED', '對帳服務回應不可轉址');
  }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new OrderConflict(503, 'RECONCILIATION_INVALID_RESPONSE', '對帳服務回應格式不正確');
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new OrderConflict(503, 'RECONCILIATION_UNAVAILABLE', '對帳服務暫時無法使用');
  }

  let bytes = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxResponseBytes) {
      await reader.cancel();
      throw new OrderConflict(503, 'RECONCILIATION_TOO_LARGE', '對帳資料量超過安全範圍');
    }
    chunks.push(chunk.value);
  }

  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let data: { success?: boolean; data?: unknown; code?: unknown };
  try {
    data = JSON.parse(new TextDecoder().decode(joined)) as { success?: boolean; data?: unknown };
  } catch {
    throw new OrderConflict(503, 'RECONCILIATION_INVALID_RESPONSE', '對帳服務回應格式不正確');
  }
  if (input.action === 'create_manual') {
    if (response.ok && data.success === true) return { status: 200, result: data.data };
    const error = data as { message?: unknown; safe_to_restart?: unknown };
    const message = typeof error.message === 'string' && error.message.length <= 300 && !/[<>]/.test(error.message)
      ? error.message : '入單結果尚待確認，請保留原資料並核對';
    const status = [400,401,403,409,429,503].includes(response.status) ? response.status : 503;
    return { status, result: { success: false, message, safe_to_restart: status === 400 && error.safe_to_restart === true } };
  }
  if (!response.ok) {
    if (input.action === 'list' || input.action === 'list_page') {
      const safe = safeOperationsPaginationError(data.code, response.status);
      if (safe) throw new OrderConflict(safe.status, safe.code, safe.message);
    }
    throw new OrderConflict(409, 'CHECKOUT_RECONCILIATION_UNCERTAIN', '下單核對尚未完成，沒有自動補寫或重寄');
  }
  if (data.success !== true) {
    throw new OrderConflict(409, 'CHECKOUT_RECONCILIATION_UNCERTAIN', '下單核對尚未完成，沒有自動補寫或重寄');
  }
  if (input.action === 'list_page') {
    let page;
    try {
      page = await validateOperationsPageEnvelope(data.data, pageSize, { kind: 'checkouts', actor });
    } catch {
      throw new OrderConflict(503, 'RECONCILIATION_INVALID_RESPONSE', '對帳服務回應格式不正確');
    }
    return { items: page.items, pagination: page.pagination };
  }
  if (input.action === 'list') {
    if (!Array.isArray(data.data)) {
      throw new OrderConflict(503, 'RECONCILIATION_INVALID_RESPONSE', '對帳服務回應格式不正確');
    }
    if (data.data.length > 100) {
      throw new OrderConflict(409, 'OPERATIONS_RELOAD_REQUIRED', '待辦清單超過舊版讀取上限，請重新載入');
    }
  }
  return data.data;
}
