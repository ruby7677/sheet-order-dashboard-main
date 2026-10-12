import { z } from 'zod';
import { safeOperationsPaginationError, validateOperationsPageCursorScope, validateOperationsPageEnvelope } from './OperationsPagination';

const checkoutListSchema = z.object({ action: z.literal('list') }).strict();
const checkoutListPageSchema = z.object({
  action: z.literal('list_page'),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
export const checkoutMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('confirm_existing'), order_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('retry_customer'), order_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('confirm_stock'), order_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('retry_budget_sms'), order_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict(),
  z.object({ action: z.literal('close_missing_primary'), order_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).strict(),
]);
export const checkoutRequestSchema = z.union([checkoutListSchema, checkoutListPageSchema, checkoutMutationSchema]);
export type CheckoutGatewayRequest = z.infer<typeof checkoutRequestSchema>;

export interface CheckoutServiceBinding {
  fetch(input: Request | URL, init?: RequestInit): Promise<Response>;
}

const internalBase = 'https://catalog.example.com';
const checkoutPath = '/internal/checkout-reconciliation';
const maxRequestBytes = 32_768;
const maxResponseBytes = 65_536;

export type CheckoutGatewayCode =
  | 'CATALOG_BINDING_MISSING'
  | 'CATALOG_ACCESS_ASSERTION_MISSING'
  | 'CATALOG_REQUEST_TOO_LARGE'
  | 'CATALOG_REQUEST_CONSTRUCTION_FAILED'
  | 'CATALOG_BINDING_FETCH_FAILED'
  | 'CATALOG_DOWNSTREAM_UNAUTHORIZED'
  | 'CATALOG_DOWNSTREAM_FORBIDDEN'
  | 'CATALOG_DOWNSTREAM_REDIRECT_REJECTED'
  | 'CATALOG_DOWNSTREAM_UNAVAILABLE'
  | 'CATALOG_DOWNSTREAM_HTTP_ERROR'
  | 'CATALOG_RESPONSE_INVALID'
  | 'CATALOG_RESPONSE_TOO_LARGE'
  | 'CATALOG_RESPONSE_READ_FAILED'
  | 'CATALOG_VERSION_INVALID'
  | 'OPERATIONS_PAGE_CURSOR_INVALID'
  | 'OPERATIONS_PAGE_REQUEST_INVALID'
  | 'OPERATIONS_PAGE_EXPIRED'
  | 'OPERATIONS_RELOAD_REQUIRED'
  | 'OPERATIONS_SNAPSHOT_CORRUPT'
  | 'OPERATIONS_SNAPSHOT_TOO_LARGE'
  | 'CATALOG_GATEWAY_UNEXPECTED_FAILURE';

export class CheckoutGatewayError extends Error {
  constructor(public status: 400 | 401 | 403 | 409 | 413 | 429 | 503, public code: CheckoutGatewayCode) {
    super(code);
  }
}

function errorForDownstreamStatus(status: number): CheckoutGatewayError {
  if (status >= 300 && status < 400) return new CheckoutGatewayError(503, 'CATALOG_DOWNSTREAM_REDIRECT_REJECTED');
  if (status === 401) return new CheckoutGatewayError(401, 'CATALOG_DOWNSTREAM_UNAUTHORIZED');
  if (status === 403) return new CheckoutGatewayError(403, 'CATALOG_DOWNSTREAM_FORBIDDEN');
  if (status === 429) return new CheckoutGatewayError(429, 'CATALOG_DOWNSTREAM_HTTP_ERROR');
  if (status === 503) return new CheckoutGatewayError(503, 'CATALOG_DOWNSTREAM_UNAVAILABLE');
  return new CheckoutGatewayError(503, 'CATALOG_DOWNSTREAM_HTTP_ERROR');
}

function requireBinding(binding: CheckoutServiceBinding | undefined): CheckoutServiceBinding {
  if (!binding || typeof binding.fetch !== 'function') {
    throw new CheckoutGatewayError(503, 'CATALOG_BINDING_MISSING');
  }
  return binding;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel().catch(() => undefined);
    throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_INVALID');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_INVALID');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel();
        throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_TOO_LARGE');
      }
      chunks.push(next.value);
    }
  } catch (error) {
    if (error instanceof CheckoutGatewayError) throw error;
    throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_READ_FAILED');
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_INVALID');
  }
}

async function invoke(binding: CheckoutServiceBinding, input: Request | URL, init?: RequestInit): Promise<Response> {
  try {
    return await binding.fetch(input, init);
  } catch {
    throw new CheckoutGatewayError(503, 'CATALOG_BINDING_FETCH_FAILED');
  }
}

/** Forward the validated operation and only the Access assertion through the Worker service binding. */
export async function checkoutGateway(
  binding: CheckoutServiceBinding | undefined,
  accessJwt: string,
  input: CheckoutGatewayRequest,
  actor?: string,
): Promise<unknown> {
  const service = requireBinding(binding);
  if (!accessJwt || accessJwt.length > 16_384) {
    throw new CheckoutGatewayError(403, 'CATALOG_ACCESS_ASSERTION_MISSING');
  }

  const validated = checkoutRequestSchema.parse(input);
  if (validated.action === 'list_page' && validated.cursor && actor) {
    try {
      await validateOperationsPageCursorScope(validated.cursor, validated.page_size ?? 50, 'checkouts', actor);
    } catch {
      throw new CheckoutGatewayError(400, 'OPERATIONS_PAGE_CURSOR_INVALID');
    }
  }
  const body = JSON.stringify(validated);
  if (new TextEncoder().encode(body).byteLength > maxRequestBytes) {
    throw new CheckoutGatewayError(400, 'CATALOG_REQUEST_TOO_LARGE');
  }

  let request: Request;
  try {
    request = new Request(`${internalBase}${checkoutPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cf-Access-Jwt-Assertion': accessJwt,
      },
      body,
      redirect: 'manual',
    });
  } catch {
    throw new CheckoutGatewayError(503, 'CATALOG_REQUEST_CONSTRUCTION_FAILED');
  }

  const response = await invoke(service, request);
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => undefined);
    throw new CheckoutGatewayError(503, 'CATALOG_DOWNSTREAM_REDIRECT_REJECTED');
  }
  if (!response.ok) {
    if ([400, 409, 413].includes(response.status)) {
      try {
        const errorBody = await readBoundedJson(response) as { code?: unknown };
        const safe = safeOperationsPaginationError(errorBody?.code, response.status);
        if (safe) throw new CheckoutGatewayError(safe.status, safe.code);
      } catch (error) {
        if (error instanceof CheckoutGatewayError) throw error;
      }
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    throw errorForDownstreamStatus(response.status);
  }
  const result = await readBoundedJson(response) as { success?: boolean; data?: unknown };
  if (result?.success !== true || !Object.hasOwn(result, 'data')) {
    throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_INVALID');
  }
  if (validated.action === 'list_page') {
    try {
      return await validateOperationsPageEnvelope(
        result.data,
        validated.page_size ?? 50,
        actor ? { kind: 'checkouts', actor } : undefined,
      );
    } catch {
      throw new CheckoutGatewayError(503, 'CATALOG_RESPONSE_INVALID');
    }
  }
  return result.data;
}

/** Safe read-only probe used only by the authenticated Admin API route. */
export async function catalogVersionDiagnostic(
  binding: CheckoutServiceBinding | undefined,
): Promise<{ status: 200; revision: number }> {
  const service = requireBinding(binding);
  const target = new URL(`${internalBase}/public/version`);
  const response = await invoke(service, target, { method: 'GET', redirect: 'manual' });
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    await response.body?.cancel().catch(() => undefined);
    throw new CheckoutGatewayError(503, 'CATALOG_DOWNSTREAM_REDIRECT_REJECTED');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw errorForDownstreamStatus(response.status);
  }
  const value = await readBoundedJson(response) as { revision?: unknown };
  if (!Number.isSafeInteger(value?.revision) || (value.revision as number) < 1) {
    throw new CheckoutGatewayError(503, 'CATALOG_VERSION_INVALID');
  }
  return { status: 200, revision: value.revision as number };
}
