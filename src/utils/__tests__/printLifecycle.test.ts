import { afterEach, describe, expect, it, vi } from 'vitest';
import { openOrderPrintWindow, printOrders } from '../exportUtils';

afterEach(() => vi.restoreAllMocks());

describe('order print lifecycle', () => {
  it('registers after document.open clears listeners, prints once and keeps preview', () => {
    const listeners = new Map<string, () => void>();
    const calls: string[] = [];
    const popup = {
      closed: false,
      document: {
        open: () => { calls.push('open'); listeners.clear(); },
        write: vi.fn(),
        close: () => { calls.push('close'); listeners.get('load')?.(); listeners.delete('load'); },
      },
      addEventListener: (name: string, callback: () => void) => { calls.push('listen'); listeners.set(name, callback); },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(), setTimeout: vi.fn(),
    };
    printOrders([], popup as unknown as Window);
    expect(calls).toEqual(['open', 'listen', 'close']);
    expect(popup.print).toHaveBeenCalledOnce();
    expect(popup.focus).toHaveBeenCalledOnce();
    expect(popup.close).not.toHaveBeenCalled();
    expect(popup.setTimeout).not.toHaveBeenCalled();
    expect(popup.document.write).toHaveBeenCalled();
  });

  it('reserves the popup synchronously and reuses it without a second window.open', () => {
    const popup = { document: { title: '', body: { textContent: '' } } };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    expect(openOrderPrintWindow()).toBe(popup);
    expect(open).toHaveBeenCalledOnce();
    expect(popup.document.body.textContent).toContain('正在取得訂單');
  });

  it('does not touch a preview that the user closed during the read', () => {
    const popup = { closed: true };
    const open = vi.spyOn(window, 'open');
    expect(() => printOrders([], popup as Window)).not.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});
