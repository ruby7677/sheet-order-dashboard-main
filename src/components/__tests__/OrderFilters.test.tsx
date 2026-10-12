import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OrderFilters from '../OrderFilters';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OrderFilters delivery-period shortcuts', () => {
  it('applies Taipei Wednesday-to-Saturday ranges and clears dates without losing other filters', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T16:30:00.000Z'));
    const onFilterChange = vi.fn();

    render(<OrderFilters onFilterChange={onFilterChange} />);

    const search = screen.getByPlaceholderText('搜尋訂單編號、姓名或電話');
    fireEvent.change(search, { target: { value: 'synthetic-search' } });
    fireEvent.submit(search.closest('form') as HTMLFormElement);

    const shortcuts: Array<[string, string, string]> = [
      ['上週三～六', '2026-09-30', '2026-10-03'],
      ['本週三～六', '2026-10-07', '2026-10-10'],
      ['下週三～六', '2026-10-14', '2026-10-17'],
    ];
    for (const [label, startDate, endDate] of shortcuts) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      const filters = onFilterChange.mock.lastCall?.[0];
      expect(filters.dateRange).toEqual({ startDate, endDate });
      expect(filters.search).toBe('synthetic-search');
      expect(filters.status).toBe('所有狀態');
      expect(filters.deliveryMethod).toBe('所有配送方式');
      expect(filters.paymentStatus).toBe('所有付款狀態');
    }

    fireEvent.click(screen.getByRole('button', { name: '清除日期' }));
    const clearedFilters = onFilterChange.mock.lastCall?.[0];
    expect(clearedFilters.dateRange).toEqual({ startDate: undefined, endDate: undefined });
    expect(clearedFilters.search).toBe('synthetic-search');
    expect(screen.getByRole('button', { name: '開始配送／到貨日期' }).textContent).toContain('開始日期');
    expect(screen.getByRole('button', { name: '結束配送／到貨日期' }).textContent).toContain('結束日期');
  });
});
