import { afterEach, describe, expect, it, vi } from 'vitest';
import { printOrders } from '../exportUtils';
import { escapeHtml } from '../htmlUtils';
import type { Order } from '@/types/order';

afterEach(() => vi.restoreAllMocks());

describe('order print security', () => {
  it('renders stored HTML as text in the actual print template', () => {
    const writer = vi.spyOn(document, 'write').mockImplementation(() => {});
    vi.spyOn(window, 'open').mockReturnValue(window);
    const order: Order = {
      id: '1', orderNumber: '<img src=x onerror=alert(1)>',
      customer: { name: '張 & 林 <svg onload=alert(2)>', phone: '0912345678' },
      items: [{ product: '<img src=y onerror=alert(3)>', price: 100, quantity: 1, subtotal: 100 }],
      total: 100, status: '訂單確認中', createdAt: '2026-09-30',
      deliveryMethod: '宅配到府', deliveryAddress: '<iframe src=javascript:alert(4)>',
      dueDate: '2026-10-01', deliveryTime: '上午', paymentMethod: '銀行轉帳',
      notes: '</script><img src=z onerror=alert(5)>', paymentStatus: '未收費',
    };
    printOrders([order]);
    const html = writer.mock.calls.map(call => call.join('')).join('');
    expect(html).not.toContain('<img src=');
    expect(html).not.toContain('<svg onload=');
    expect(html).not.toContain('<iframe src=');
    expect(html).toContain('張 &amp; 林 &lt;svg');
    expect(html).toContain('&lt;/script&gt;&lt;img');
    expect(html).toContain('&lt;img src=y');
    expect(html).toContain('總計: $100');
  });

  it('preserves plain text and encodes HTML delimiters and quotes', () => {
    expect(escapeHtml('中文 "字" & <標籤>')).toBe('中文 &quot;字&quot; &amp; &lt;標籤&gt;');
    expect(escapeHtml(null)).toBe('');
  });
});
