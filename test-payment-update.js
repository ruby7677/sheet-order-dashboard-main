/**
 * 測試款項狀態更新功能
 * 用於驗證 Pages 部署環境下的 API 呼叫是否正常
 */

// 模擬前端的 API 呼叫邏輯
const testPaymentStatusUpdate = async () => {
  console.log('開始測試款項狀態更新功能...');
  
  // 測試用的訂單 ID（請替換為實際存在的訂單 ID）
  const testOrderId = '1'; // 請根據實際情況修改
  const testPaymentStatus = '已收費';
  
  try {
    // 測試 Workers API 端點
    console.log('測試 Workers API 端點: /api/orders/payment');
    const workersResponse = await fetch('/api/orders/payment', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        id: testOrderId, 
        status: testPaymentStatus 
      })
    });
    
    if (workersResponse.ok) {
      const result = await workersResponse.json();
      console.log('✅ Workers API 測試成功:', result);
      return true;
    } else {
      console.log('❌ Workers API 測試失敗:', workersResponse.status, workersResponse.statusText);
      const errorText = await workersResponse.text();
      console.log('錯誤詳情:', errorText);
    }
  } catch (error) {
    console.log('❌ Workers API 測試發生錯誤:', error);
  }
  
  try {
    // 測試 PHP API 端點（fallback）
    console.log('測試 PHP API 端點: /api/update_payment_status.php');
    const timestamp = Date.now();
    const nonce = Math.random().toString(36).substring(2, 15);
    
    const phpResponse = await fetch(`/api/update_payment_status.php?_=${timestamp}&nonce=${nonce}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        id: testOrderId, 
        paymentStatus: testPaymentStatus,
        timestamp,
        nonce
      })
    });
    
    if (phpResponse.ok) {
      const result = await phpResponse.json();
      console.log('✅ PHP API 測試成功:', result);
      return true;
    } else {
      console.log('❌ PHP API 測試失敗:', phpResponse.status, phpResponse.statusText);
      const errorText = await phpResponse.text();
      console.log('錯誤詳情:', errorText);
    }
  } catch (error) {
    console.log('❌ PHP API 測試發生錯誤:', error);
  }
  
  return false;
};

// 如果在瀏覽器環境中執行
if (typeof window !== 'undefined') {
  // 將測試函數掛載到全域物件，方便在開發者工具中呼叫
  window.testPaymentStatusUpdate = testPaymentStatusUpdate;
  console.log('測試函數已載入，請在開發者工具中執行: testPaymentStatusUpdate()');
}

// 如果在 Node.js 環境中執行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testPaymentStatusUpdate };
}