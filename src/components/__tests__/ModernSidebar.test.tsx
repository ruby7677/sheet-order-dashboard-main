import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ModernSidebar from '../ModernSidebar';

const { mockLogout } = vi.hoisted(() => ({ mockLogout: vi.fn() }));

vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'sidebar-test@example.invalid' },
    logout: mockLogout,
  }),
}));

vi.mock('@/hooks/useScrollAwareMenu', () => ({
  default: () => ({ isVisible: true }),
}));

const defaultProps = {
  pageMode: 'orders' as const,
  onPageModeChange: vi.fn(),
  orderStats: { total: 12345678, pending: 678, completed: 901 },
  customerStats: { total: 54321, active: 4321 },
};

beforeEach(() => {
  mockLogout.mockClear();
  defaultProps.onPageModeChange.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ModernSidebar', () => {
  it('removes the static system-health card and keeps account/logout controls', () => {
    render(<ModernSidebar {...defaultProps} />);

    expect(screen.queryByText('系統狀態')).toBeNull();
    expect(screen.queryByText('運行正常')).toBeNull();
    expect(screen.getByText('蘿蔔糕訂單系統')).toBeTruthy();
    expect(screen.getByText('sidebar-test@example.invalid')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '登出管理後台' }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('wraps menu labels around non-shrinking counters and shows them in mobile sheet when desktop is collapsed', async () => {
    render(<ModernSidebar {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: '收合側邊欄' }));
    expect(screen.queryByText('蘿蔔糕訂單系統')).toBeNull();
    expect(screen.queryByText('訂單管理')).toBeNull();
    for (const label of ['訂單管理', '客戶資料', '待辦對帳', '商品設定', '到貨日期設定']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }

    fireEvent.click(screen.getByRole('button', { name: '開啟選單' }));
    const mobileDialog = await screen.findByRole('dialog');
    expect(mobileDialog.className).toContain('flex');
    expect(mobileDialog.className).toContain('flex-col');
    const sidebarTitle = within(mobileDialog).getByText('蘿蔔糕訂單系統');
    expect(sidebarTitle).toBeTruthy();
    expect(sidebarTitle.className).toContain('whitespace-normal');
    expect(sidebarTitle.className).toContain('break-words');
    expect(sidebarTitle.parentElement?.className).toContain('min-w-0');
    expect(sidebarTitle.parentElement?.className).toContain('flex-1');
    expect(within(mobileDialog).getByText('訂單管理')).toBeTruthy();
    expect(within(mobileDialog).getByText('到貨日期設定')).toBeTruthy();
    expect(within(mobileDialog).getByText('sidebar-test@example.invalid')).toBeTruthy();

    const menuTitle = within(mobileDialog).getByText('到貨日期設定');
    for (const className of ['min-w-0', 'flex-1', 'whitespace-normal', 'break-words']) {
      expect(menuTitle.className).toContain(className);
    }
    const largeCounter = within(mobileDialog).getByText('12345678');
    expect(largeCounter.className).toContain('shrink-0');
    expect(menuTitle.className).not.toMatch(/truncate|text-ellipsis|whitespace-nowrap/);

    const mobileNavigation = within(mobileDialog).getAllByRole('navigation', { name: '主選單' })[0];
    expect(mobileNavigation.className).toContain('flex-1');
    expect(mobileNavigation.className).toContain('min-h-0');
    const sidebarLayout = mobileNavigation.firstElementChild as HTMLElement;
    expect(sidebarLayout.className).toContain('h-full');
    expect(sidebarLayout.className).toContain('min-h-0');
    const [header, scrollRegion, footer] = Array.from(sidebarLayout.children) as HTMLElement[];
    expect(header.className).toContain('shrink-0');
    expect(scrollRegion.className).toContain('overflow-y-auto');
    expect(scrollRegion.className).toContain('min-h-0');
    expect(scrollRegion.className).toContain('flex-1');
    expect(footer.className).toContain('shrink-0');
    expect(within(footer).getByRole('button', { name: '登出管理後台' })).toBeTruthy();

    fireEvent.click(within(mobileDialog).getByRole('button', { name: /到貨日期設定/ }));
    expect(defaultProps.onPageModeChange).toHaveBeenCalledWith('delivery-settings');
    await waitFor(() => expect(screen.getByRole('button', { name: '開啟選單' }).getAttribute('aria-expanded')).toBe('false'));
  });
});
