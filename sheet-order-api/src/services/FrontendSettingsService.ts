// Fixed read-only sources used by the running storefront. No caller URL, cookie or token is forwarded.
const sources = {
  products: 'https://lopokao.767780.xyz/api/products_manager.php',
  delivery: 'https://lopokao.767780.xyz/api/delivery_settings.php',
} as const;

export async function readFrontendSettings(resource: keyof typeof sources): Promise<unknown> {
  const response = await fetch(sources[resource], { method: 'GET', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw new Error('Settings source unavailable');
  if (!response.body) throw new Error('Settings source empty');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new Error('Settings payload too large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  const result = JSON.parse(text) as { success?: boolean; data?: unknown };
  if (result.success !== true || !result.data || (resource === 'products' && !Array.isArray(result.data))) throw new Error('Invalid settings response');
  return result.data;
}
