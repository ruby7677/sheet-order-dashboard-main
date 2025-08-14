# 款項狀態更新問題修復報告

**修復日期**：2024-12-19  
**問題描述**：專案在 Cloudflare Pages 部署時，款項狀態無法更新的問題  
**影響範圍**：主頁訂單列表、訂單詳情頁面的款項狀態更新功能  

## 問題分析

### 根本原因
1. **API 端點路徑不一致**：前端呼叫 `/update-payment-status`，但 Workers API 實際端點為 `/api/orders/payment`
2. **HTTP 方法不匹配**：前端使用 POST，但 Workers API 註冊為 PUT
3. **參數格式不一致**：API schema 期望 `{ id, status }`，但處理邏輯解析 `{ id: rowId, paymentStatus }`
4. **支援的狀態值不完整**：API schema 只支援部分狀態值，缺少前端實際使用的狀態

### 問題影響
- 在 Cloudflare Pages 環境下，款項狀態更新功能完全失效
- 用戶無法更新訂單的付款狀態
- 主頁與詳情頁面的狀態同步出現問題

## 修復方案

### 1. 修正前端 API 呼叫邏輯
**檔案**：`src/services/orderService.ts`

#### 修改內容：
- 修正 Workers API 端點路徑：`/update-payment-status` → `/api/orders/payment`
- 修正 HTTP 方法：POST → PUT
- 保持 fallback 機制，確保向後相容性

```typescript
// 修正前
const workersEndpoint = '/update-payment-status';
res = await apiCallWithFallback(workersEndpoint, {
  method: 'POST',
  // ...
});

// 修正後
const workersEndpoint = '/api/orders/payment';
res = await apiCallWithFallback(workersEndpoint, {
  method: 'PUT',
  // ...
});
```

### 2. 統一前端組件的 API 呼叫
**檔案**：`src/components/OrderDetail.tsx`

#### 修改內容：
- 移除直接的 fetch 呼叫
- 使用 `orderService.updateOrderPaymentStatus` 統一處理
- 改善錯誤處理邏輯

```typescript
// 修正前
const res = await fetch('/api/update_payment_status.php', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: order.id, paymentStatus: newPaymentStatus })
});

// 修正後
await updateOrderPaymentStatus(order.id, newPaymentStatus);
```

### 3. 修正 Workers API 端點實作
**檔案**：`sheet-order-api/src/endpoints/updatePaymentStatus.ts`

#### 修改內容：
- 統一參數解析邏輯：`{ id: rowId, paymentStatus }` → `{ id: rowId, status: paymentStatus }`
- 更新 schema 支援的狀態值：新增 `['', '未收費', '已收費', '待轉帳', '未全款', '特殊']`

```typescript
// 修正前
const { id: rowId, paymentStatus } = body;
status: z.enum(['未付款', '已付款', '部分付款', '退款'])

// 修正後
const { id: rowId, status: paymentStatus } = body;
status: z.enum(['', '未收費', '已收費', '待轉帳', '未全款', '特殊'])
```

## 修復驗證

### 測試腳本
建立了 `test-payment-update.js` 測試腳本，用於驗證：
1. Workers API 端點的正確性
2. PHP API fallback 機制
3. 參數格式的相容性

### 驗證步驟
1. 在瀏覽器開發者工具中執行測試腳本
2. 驗證 Workers API 端點回應
3. 確認 fallback 機制正常運作
4. 測試主頁與詳情頁面的狀態同步

## 預期效果

### 修復後的改善
1. **功能恢復**：Cloudflare Pages 環境下款項狀態更新功能正常運作
2. **狀態同步**：主頁訂單列表與詳情頁面的款項狀態保持同步
3. **錯誤處理**：改善錯誤訊息顯示，提供更好的用戶體驗
4. **向後相容**：保持與舊版 PHP API 的相容性

### 技術改善
1. **統一 API 呼叫**：所有款項狀態更新都通過 `orderService` 統一處理
2. **錯誤處理**：統一的錯誤處理邏輯和用戶提示
3. **快取管理**：確保更新後正確清除相關快取

## 後續建議

1. **監控部署**：密切監控 Pages 環境的 API 呼叫狀況
2. **測試覆蓋**：建立自動化測試確保功能穩定性
3. **文件更新**：更新 API 文件，確保前後端一致性
4. **效能優化**：考慮批量更新的效能優化

## 相關檔案清單

### 修改的檔案
- `src/services/orderService.ts` - 修正 API 端點和 HTTP 方法
- `src/components/OrderDetail.tsx` - 統一 API 呼叫邏輯
- `sheet-order-api/src/endpoints/updatePaymentStatus.ts` - 修正參數解析和狀態值
- `todolist.md` - 更新任務狀態和修復記錄

### 新增的檔案
- `test-payment-update.js` - API 功能測試腳本
- `payment-status-fix-report.md` - 本修復報告

---

**修復完成**：所有相關問題已修復，款項狀態更新功能在 Cloudflare Pages 環境下應能正常運作。