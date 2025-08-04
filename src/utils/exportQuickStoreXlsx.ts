import * as XLSX from 'xlsx';
import { Order } from '@/types/order';

/**
 * 下載快速到店 xlsx
 * @param orders 勾選的訂單
 * @param filename 檔案名稱
 */
export function downloadQuickStoreXlsx(orders: Order[], filename = '快速到店訂單.xlsx') {
  // 標題
  const headers = [
    '訂單編號',
    '收件人姓名(必填)',
    '收件人手機(必填)',
    'FB名稱',
    '訂單備註',
    '代收金額',
    '門市編號(必填)',
    '匯款帳戶後五碼',
    '列印張數',
    '溫層'
  ];

  // 產生資料
  const data = orders.map((order, idx) => {
    // 訂單編號：依勾選順序產生1~99
    const orderNumber = (idx + 1).toString();
    // 收件人姓名
    const name = order.customer.name || '';
    // 收件人手機
    const phone = order.customer.phone || '';
    // FB名稱
    const fbName = '';
    // 訂單備註
    const notes = order.notes || '';
    // 代收金額
    const cod = order.paymentStatus === '已收費' ? '0' : (order.paymentMethod === '貨到付款' ? order.total : '0');
    // 門市編號：配送地址最後6碼數字
    let storeCode = '';
    const match = (order.deliveryAddress || '').match(/(\d{6})$/);
    if (match) storeCode = match[1];
    // 匯款帳戶後五碼
    const bankCode = cod ? '' : '';
    // 列印張數
    const printCount = '1';
    // 溫層
    const temp = '0002';
    return [orderNumber, name, phone, fbName, notes, cod, storeCode, bankCode, printCount, temp];
  });

  // 建立 worksheet & workbook
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'B2S訂單');

  // 下載
  XLSX.writeFile(wb, filename);
}
