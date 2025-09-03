
import { Order } from '@/types/order';
import { exportToCsv } from '@/services/orderService';

export const downloadCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  
  // 最佳相容性方案：application/octet-stream 強制下載
  // 無 BOM 輸出，符合黑貓系統期待的純文字格式
  const csvBytes = new TextEncoder().encode(csvContent);
  const blob = new Blob([csvBytes], { type: 'application/octet-stream' });
  
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
 * 專為黑貓宅配系統設計的CSV下載功能
 * 採用最佳相容性策略：application/octet-stream + 無 BOM
 */
export const downloadBlackCatCsv = (orders: Order[], filename: string = 'blackcat_orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  
  // 黑貓系統最佳相容性方案
  // 1. 使用 application/octet-stream 強制下載，避免瀏覽器編碼干預
  // 2. 無 BOM 輸出，符合傳統系統期待
  // 3. 純 UTF-8 編碼，現代系統標準
  const csvBytes = new TextEncoder().encode(csvContent);
  const blob = new Blob([csvBytes], { type: 'application/octet-stream' });
  
  downloadBlob(blob, filename);
};

/**
 * 降級方案：UTF-8 with BOM（適用於Excel等軟體）
 */
const downloadWithUtf8BomFallback = (csvContent: string, filename: string): void => {
  // 適用於需要 BOM 標記的舊版軟體
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
 * 多編碼方案下載器（提供多種相容性選項）
 */
export const downloadMultiFormatCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  
  // 方案1：黑貓系統最佳相容性（推薦）
  try {
    downloadBlackCatCsv(orders, `blackcat_${filename}`);
    console.log('✅ 已使用黑貓系統最佳相容性格式下載');
  } catch (error) {
    console.warn('黑貓格式下載失敗，使用降級方案', error);
    
    // 方案2：降級到 UTF-8 with BOM
    try {
      downloadWithUtf8BomFallback(csvContent, `bom_${filename}`);
      console.log('⚠️ 已降級使用 UTF-8 BOM 格式下載');
    } catch (fallbackError) {
      console.error('所有下載方案失敗', fallbackError);
      // 最終降級到基本方案
      downloadCsv(orders, filename);
    }
  }
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
 * Excel 偏好 UTF-8 with BOM 格式
 */
export const downloadExcelCsv = (orders: Order[], filename: string = 'excel_orders.csv'): void => {
  const csvContent = exportToCsv(orders);
  downloadWithUtf8BomFallback(csvContent, filename);
};

/**
 * 下載黑貓系統相容性指南
 */
export const downloadBlackCatGuide = (): void => {
  const guide = `黑貓宅配 CSV 檔案相容性指南
===========================

系統已針對黑貓宅配系統進行最佳化：

✅ 最佳相容性設定：
- 檔案格式：application/octet-stream
- 編碼方式：UTF-8 (無 BOM)
- 換行符號：CRLF (Windows 標準)
- 字符處理：自動移除特殊符號

📋 下載選項說明：
1. downloadBlackCatCsv() - 黑貓系統專用格式（推薦）
2. downloadExcelCsv() - Excel 相容格式 (UTF-8 + BOM)
3. downloadMultiFormatCsv() - 多格式降級下載

🔧 如遇亂碼處理步驟：

方法一：記事本轉換（最有效）
1. 用記事本開啟下載的 CSV 檔案
2. 點選「檔案」→「另存新檔」
3. 編碼選擇「ANSI」或「Big5」
4. 儲存後匯入黑貓系統

方法二：系統確認
1. 確認黑貓系統版本和編碼設定
2. 聯絡黑貓技術支援確認最新規格

⚡ 技術優化：
- 無 BOM 輸出：符合傳統系統期待
- 強制下載：避免瀏覽器編碼干預  
- 字符標準化：確保系統識別
- 多層降級：確保下載成功

最後更新：${new Date().toLocaleDateString('zh-TW')}
`;

  const blob = new Blob([guide], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, '黑貓宅配CSV相容性指南.txt');
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
