import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { exportToCsv } from '@/services/orderService';
import OrderDetail from '@/components/OrderDetail';
import type { Order } from '@/types/order';
import { createBlackCatXlsxBuffer, printOrders } from '../exportUtils';
import { quoteCsvText } from '../csvSecurity';

afterEach(() => vi.restoreAllMocks());

const makeOrder = (overrides: Partial<Order> = {}): Order => ({
  id: '9d6b90b1-836f-4cd5-b65e-2b8f77cd88c0',
  orderNumber: 'ORD-UUID-1',
  customer: { name: '王小明', phone: '0912345678' },
  items: [{ product: '蘿蔔糕', price: 100, quantity: 1, subtotal: 100 }],
  total: 100,
  status: '訂單確認中',
  createdAt: '2026-10-01',
  deliveryMethod: '宅配到府',
  deliveryAddress: '雲林縣西螺鎮中山路302-3號',
  dueDate: '2026-10-02',
  deliveryTime: '上午',
  paymentMethod: '銀行轉帳',
  notes: '到貨前請先聯絡',
  paymentStatus: '未收費',
  ...overrides,
});

const capturePrintHtml = (order: Order): string => {
  const written: string[] = [];
  const popup = {
    document: { title: '', body: { textContent: '' }, open: vi.fn(), write: vi.fn((html: string) => written.push(html)), close: vi.fn() },
    addEventListener: vi.fn(), focus: vi.fn(), print: vi.fn(), setTimeout: vi.fn(), close: vi.fn(),
  } as unknown as Window;
  vi.spyOn(window, 'open').mockReturnValue(popup);
  printOrders([order]);
  return written.join('');
};

describe('order exports after UUID migration', () => {
  it('round-trips XLSX through ExcelJS and keeps hostile address and note values as strings', async () => {
    const address = '=HYPERLINK("https://attacker.invalid","address")';
    const notes = '+1+1';
    const buffer = await createBlackCatXlsxBuffer([makeOrder({ deliveryAddress: address, notes })]);
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);

    const worksheet = loaded.getWorksheet('宅配到府訂單');
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('G1').value).toBe(address);
    expect(worksheet?.getCell('G1').type).not.toBe(ExcelJS.ValueType.Formula);
    expect(worksheet?.getCell('G1').formula).toBeUndefined();
    expect(worksheet?.getCell('Q1').value).toBe(notes);
    expect(worksheet?.getCell('Q1').type).not.toBe(ExcelJS.ValueType.Formula);
    expect(worksheet?.getCell('Q1').formula).toBeUndefined();

    // The export layout keeps its carrier sequence number; UUID IDs do not
    // participate in row indexing or break the generated workbook.
    expect(worksheet?.getCell('A1').value).toBe('A001');
    expect(worksheet?.getCell('G1').value).toBe(address);
  });

  it('shows unknown historical prices as 未確認 while preserving confirmed zero prices', async () => {
    const zeroItem = [{ product: '原味蘿蔔糕', product_id: 'radish', price: 0, quantity: 1, subtotal: 0 }];
    const unconfirmed = makeOrder({ can_edit_items: false, unitPricesConfirmed: false, items: zeroItem, total: 350 });
    const unconfirmedPrint = capturePrintHtml(unconfirmed);
    expect(unconfirmedPrint.match(/<td>未確認<\/td>/g)).toHaveLength(2);
    expect(unconfirmedPrint).toContain('總計: $350');

    const legacyZero = makeOrder({ can_edit_items: false, unitPricesConfirmed: undefined, items: zeroItem, total: 0 });
    const legacyPrint = capturePrintHtml(legacyZero);
    expect(legacyPrint.match(/<td>\$0<\/td>/g)).toHaveLength(2);

    const confirmedZero = makeOrder({ can_edit_items: false, unitPricesConfirmed: true, items: zeroItem, total: 0 });
    const onOrderStatusUpdate = vi.fn();
    const detail = (order: Order) => createElement(OrderDetail, { order, open: true, onClose: vi.fn(), onOrderStatusUpdate });
    const { rerender } = render(detail(unconfirmed));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('未確認')).toHaveLength(2);

    rerender(detail(confirmedZero));
    expect(await within(dialog).findByText('NT$ 0')).not.toBeNull();
    expect(within(dialog).queryByText('未確認')).toBeNull();
    expect(within(dialog).getAllByText('$0', { exact: true })).toHaveLength(2);
  });

  it('retains ordinary logistics CSV values and prefixes formula-like address and notes', () => {
    const normal = makeOrder();
    const ordinaryCsv = exportToCsv([normal]);
    expect(ordinaryCsv).toContain('雲林縣西螺鎮中山路302-3號');
    expect(ordinaryCsv).toContain('到貨前請先聯絡');
    expect(ordinaryCsv).not.toContain("'雲林縣");

    const address = '=HYPERLINK("https://attacker.invalid","address")';
    const notes = '@SUM(1,2)';
    const hostileCsv = exportToCsv([makeOrder({ deliveryAddress: address, notes })]);
    expect(hostileCsv).toContain(quoteCsvText(address));
    expect(hostileCsv).toContain(quoteCsvText(notes));
  });

  it('prints through the authorized module event handler without embedding an inline script', () => {
    const written: string[] = [];
    let onLoad: EventListener | undefined;
    const popup = {
      document: {
        title: '', body: { textContent: '' },
        open: vi.fn(() => { onLoad = undefined; }),
        write: vi.fn((html: string) => written.push(html)),
        close: vi.fn(),
      },
      addEventListener: vi.fn((type: string, callback: EventListener) => {
        if (type === 'load') onLoad = callback;
      }),
      focus: vi.fn(),
      print: vi.fn(),
      setTimeout: vi.fn(),
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);

    printOrders([makeOrder()]);

    const html = written.join('');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).toContain('雲林縣西螺鎮中山路302-3號');
    expect(onLoad).toBeDefined();

    onLoad?.(new Event('load'));
    expect(popup.focus).toHaveBeenCalledOnce();
    expect(popup.print).toHaveBeenCalledOnce();
    expect(popup.setTimeout).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });
});
