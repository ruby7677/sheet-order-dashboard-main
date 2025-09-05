
import { Order } from '@/types/order';
import { exportToCsv } from '@/services/orderService';
import ExcelJS from 'exceljs';

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
/**
 * 專為黑貓宅配系統設計的 Excel XLS 下載功能
 * 提供最佳的相容性和編碼支援
 */
export const downloadBlackCatXls = async (orders: Order[], filename: string = '宅配到府訂單.xlsx'): Promise<void> => {
  try {
    // 建立新的工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('宅配到府訂單');
    
    // 黑貓宅急便標準欄位
    //const headers = [
    //  '訂單編號',
    //  '溫層', 
    //  '規格',
    //  '代收貨款',
    //  '收件人-姓名',
    //  '收件人-電話',
    //  '收件人-地址',
    //  '寄件人-姓名',
    //  '寄件人-電話',
    //  '寄件人-地址',
    //  '出貨日期',
    //  '希望配達日',
    //  '希望配合時段',
    //  '品類代碼',
    //  '品名',
    //  '易碎物品',
    //  '備註'
    //];
    
    // 設定標題行樣式
    //const headerRow = worksheet.addRow(headers);
    //headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    //headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF366092' } };
    //headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // 固定寄件人資訊
    const senderName = '曾炳傑';
    const senderPhone = '0937292815';
    const senderAddress = '雲林縣西螺鎮中山路302-3號';
    
    // 工具函數
    const removeSpecialChars = (str: string) => str.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '');
    const formatPhone = (phone: string) => /^09\d{8}$/.test(phone) ? phone : '';
    
    const today = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
    
    // 產生訂單資料
    orders.forEach((order, idx) => {
      // 依勾選順序自動產生訂單編號（A001~A100）
      const genOrderNumber = `A${(idx + 1).toString().padStart(3, '0')}`;
      
      // 希望配達日格式化
      let wishDate = '';
      if (order.dueDate) {
        const d = typeof order.dueDate === 'string' ? new Date(order.dueDate.replace(/-/g, '/')) : order.dueDate;
        if (!isNaN(d.getTime())) {
          if (d <= today) {
            const nextDay = new Date(today);
            nextDay.setDate(today.getDate() + 1);
            wishDate = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;
          } else {
            wishDate = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
          }
        }
      }
      if (!wishDate) {
        const nextDay = new Date(today);
        nextDay.setDate(today.getDate() + 1);
        wishDate = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;
      }
      
      // 希望配合時段
      let wishTime = '';
      if (order.deliveryTime) {
        if (order.deliveryTime.includes('上')) wishTime = '1';
        else if (order.deliveryTime.includes('下')) wishTime = '2';
      }
      
      const rowData = [
        genOrderNumber,
        2, // 溫層（固定）
        0, // 規格（固定）
        order.paymentStatus === '已收費' ? 0 : (order.paymentMethod === '貨到付款' ? order.total : 0),
        removeSpecialChars(order.customer.name || ''),
        formatPhone(order.customer.phone || ''),
        order.deliveryAddress || '',
        senderName,
        senderPhone,
        senderAddress,
        todayStr,
        wishDate,
        wishTime,
        '0015', // 品類代碼（固定）
        '蘿蔔糕', // 品名（固定）
        'Y', // 易碎物品（固定）
        order.notes || ''
      ];
      
      const dataRow = worksheet.addRow(rowData);
      
      // 設定資料行樣式
      dataRow.alignment = { vertical: 'middle' };
      if (idx % 2 === 0) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
      }
    });
    
    // 自動調整欄寬
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50); // 最大寬度限制
    });
    
    // 設定邊框
    /*const borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
    const border = {
      top: borderStyle,
      left: borderStyle,
      bottom: borderStyle,
      right: borderStyle
    };
    
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = border;
      });
    });*/
    
    // 產生檔案並下載
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('✅ 黑貓宅配 Excel 檔案下載完成');
  } catch (error) {
    console.error('❌ Excel 檔案下載失敗:', error);
    throw error;
  }
};

export const downloadBlackCatGuide = (): void => {
  const guide = `黑貓宅配檔案匯出指南
===================

系統提供兩種匯出格式：

🎯 Excel XLS 格式 (推薦)
- 檔案格式：.xlsx
- 相容性：最佳，支援所有版本的 Excel 和黑貓系統
- 編碼問題：無，Excel 自動處理編碼
- 樣式：包含標題樣式、邊框、自動欄寬

📄 CSV 格式 (備選)
- 檔案格式：.csv  
- 編碼：UTF-8 (無 BOM)
- 適用：文字編輯器、簡單匯入系統

🔧 使用建議：
1. 優先使用 Excel XLS 格式
2. 黑貓系統可直接匯入 .xlsx 檔案
3. 如需 CSV 格式，請參考編碼指南

📋 欄位對應：
- 訂單編號：A001~A999 (自動產生)
- 溫層：2 (冷藏)
- 代收貨款：根據付款狀態自動計算
- 收件人資訊：自動清理特殊字符
- 配送時間：1(上午) / 2(下午)
- 品名：蘿蔔糕 (固定)

最後更新：${new Date().toLocaleDateString('zh-TW')}
`;

  const blob = new Blob([guide], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, '黑貓宅配檔案匯出指南.txt');
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
