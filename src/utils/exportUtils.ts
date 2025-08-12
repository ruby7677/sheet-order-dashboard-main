
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
 * 專為Excel設計的CSV下載功能
 * 使用更強的編碼標記和格式
 */
export const downloadExcelCsv = (orders: Order[], filename: string = 'orders.csv'): void => {
  const csvContent = exportToCsv(orders);

  // 創建一個更強的UTF-8 BOM和編碼聲明
  const utf8BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const csvBytes = new TextEncoder().encode(csvContent);

  // 合併BOM和CSV內容
  const combinedArray = new Uint8Array(utf8BOM.length + csvBytes.length);
  combinedArray.set(utf8BOM, 0);
  combinedArray.set(csvBytes, utf8BOM.length);

  const blob = new Blob([combinedArray], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 清理URL
  URL.revokeObjectURL(url);
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
