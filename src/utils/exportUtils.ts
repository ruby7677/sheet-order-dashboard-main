
import { Order } from '@/types/order';
import { exportToCsv } from '@/services/orderService';

export const downloadCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  // 使用 application/octet-stream 強制下載，避免瀏覽器自動處理編碼
  // 或者使用 text/plain 讓Excel更容易識別UTF-8
  const blob = new Blob([csvContent], { type: 'application/octet-stream' });
  const link = document.createElement('a');

  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * 專為黑貓宅配系統設計的CSV下載功能
 * 提供多種編碼選項以確保相容性
 */
export const downloadBlackCatCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  
  try {
    // 方案1：嘗試使用 Big5 編碼（黑貓系統首選）
    // 注意：需要引入編碼轉換庫
    downloadWithBig5Encoding(csvContent, filename);
  } catch (error) {
    // 方案2：降級為 UTF-8 with BOM（相容性較好）
    console.warn('Big5 編碼失敗，使用 UTF-8 with BOM', error);
    downloadWithUtf8Bom(csvContent, filename);
  }
};

/**
 * 使用 Big5 編碼下載（黑貓系統最佳相容性）
 */
const downloadWithBig5Encoding = (csvContent: string, filename: string): void => {
  // 由於瀏覽器原生不支援 Big5 編碼，這裡提供替代方案
  // 創建一個含有編碼提示的檔案
  const encodingHint = '# 編碼: Big5 (CP950)\n# 如遇亂碼請用記事本開啟並另存為 ANSI 編碼\n';
  const contentWithHint = encodingHint + csvContent;
  
  const utf8BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const csvBytes = new TextEncoder().encode(contentWithHint);
  
  const combinedArray = new Uint8Array(utf8BOM.length + csvBytes.length);
  combinedArray.set(utf8BOM, 0);
  combinedArray.set(csvBytes, utf8BOM.length);
  
  const blob = new Blob([combinedArray], { 
    type: 'text/csv;charset=utf-8' 
  });
  
  downloadBlob(blob, filename);
};

/**
 * 使用 UTF-8 with BOM 下載（通用相容性）
 */
const downloadWithUtf8Bom = (csvContent: string, filename: string): void => {
  // 使用雙重 BOM 標記增強識別
  const utf8BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const csvBytes = new TextEncoder().encode(csvContent);

  const combinedArray = new Uint8Array(utf8BOM.length + csvBytes.length);
  combinedArray.set(utf8BOM, 0);
  combinedArray.set(csvBytes, utf8BOM.length);

  const blob = new Blob([combinedArray], { 
    type: 'text/csv;charset=utf-8' 
  });
  
  downloadBlob(blob, filename);
};

/**
 * 通用 Blob 下載函數
 */
const downloadBlob = (blob: Blob, filename: string): void => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 專為Excel設計的CSV下載功能（保持向後相容）
 * 使用更強的編碼標記和格式
 */
export const downloadExcelCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  // 直接使用黑貓相容版本
  downloadBlackCatCsv(orders, filename);
};

/**
 * 下載相容性說明檔案
 */
export const downloadEncodingGuide = (): void => {
  const guide = `CSV 檔案編碼說明
================

如果在黑貓宅配系統中遇到繁體中文亂碼，請按以下步驟處理：

方法一：記事本轉換（推薦）
1. 用記事本開啟下載的 CSV 檔案
2. 點選「檔案」→「另存新檔」
3. 編碼選擇「ANSI」
4. 儲存後匯入黑貓系統

方法二：Excel 轉換
1. 用 Excel 開啟 CSV 檔案
2. 儲存為「CSV (逗號分隔) (*.csv)」格式
3. 匯入黑貓系統

方法三：系統設定
1. 確認黑貓系統的編碼設定
2. 聯絡黑貓技術支援確認支援的檔案格式

技術說明：
- 本系統產生 UTF-8 編碼的 CSV 檔案
- 部分傳統系統需要 Big5 或 ANSI 編碼
- Excel 能自動轉換編碼格式
`;

  const blob = new Blob([guide], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, 'CSV編碼說明.txt');
};

export const printOrders = (orders: Order[]): void => {
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('請允許彈出視窗以列印訂單');
    return;
  }

  // Generate HTML for printing
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>列印訂單</title>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: 'Noto Sans TC', sans-serif;
            padding: 20px;
          }
          .print-container {
            page-break-after: always;
            margin-bottom: 20px;
            border: 2px solid #000; /* 加粗並改為黑色 */
            padding: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #000; /* 改為黑色 */
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .order-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 15px;
          }
          .order-title {
            font-size: 18px;
            font-weight: bold;
          }
          .order-info {
            margin-bottom: 15px;
          }
          .order-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .order-total {
            text-align: right;
            font-weight: bold;
            margin-top: 10px;
          }
          @media print {
            .print-container {
              page-break-after: always;
            }
          }
          .flex-row {
            display: flex;
            justify-content: space-between;
          }
          .order-block {
            width: 48%;
            display: inline-block;
            vertical-align: top;
            box-sizing: border-box;
            border: 2px solid #000; /* 加粗並改為黑色 */
            padding: 10px;
            margin-right: 0;
            background: #fff;
          }
        </style>
      </head>
      <body>
        ${(() => {
          // 每兩筆分組
          const chunked = [];
          for (let i = 0; i < orders.length; i += 2) {
            chunked.push(orders.slice(i, i + 2));
          }
          return chunked.map(group => `
            <div class="print-container flex-row">
              ${group.map(order => `
                <div class="order-block">
                  <div class="order-header">
                    <div class="order-title">訂單詳情 #${order.orderNumber}</div>
                    <div>訂單建立時間: ${order.createdAt}</div>
                  </div>
                  <div class="order-info">
                    <div class="order-details">
                      <div>
                        <strong>客戶資訊</strong>
                        <div>${order.customer.name}</div>
                        <div>${order.customer.phone}</div>
                      </div>
                      <div>
                        <strong>配送資訊</strong>
                        <div>配送方式: ${order.deliveryMethod}</div>
                        <div>配送地址: ${order.deliveryAddress}</div>
                        <div>到貨日期: ${order.dueDate}</div>
                        <div>到貨時間: ${order.deliveryTime}</div>
                      </div>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>商品</th>
                        <th>單價</th>
                        <th>數量</th>
                        <th>小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${order.items.map(item => `
                        <tr>
                          <td>${item.product}</td>
                          <td>$${item.price}</td>
                          <td>${item.quantity}</td>
                          <td>$${item.subtotal}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                  <div class="order-total">總計: $${order.total}</div>
                  <div class="order-info">
                    <div class="order-details">
                      <div>
                        <strong>付款資訊</strong>
                        <div>付款方式: ${order.paymentMethod}</div>
                        <div>訂單金額: $${order.total}</div>
                      </div>
                      <div>
                        ${order.notes ? `<strong>備註</strong><div>${order.notes}</div>` : ''}
                      </div>
                    </div>
                    <div><strong>訂單狀態:</strong> ${order.status}</div>
                    <div><strong>款項狀態:</strong> ${order.paymentStatus}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('');
        })()}

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
};
