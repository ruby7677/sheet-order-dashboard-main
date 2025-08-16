# Google Sheets 到 Supabase 遷移方案

## 1. 當前項目狀態分析

### 1.1 現有架構
- **前端**: React + TypeScript + Tailwind CSS
- **後端**: Cloudflare Workers + Google Sheets API
- **數據存儲**: Google Sheets（主要）+ Supabase（已配置但未使用）
- **API結構**: RESTful API 透過 Cloudflare Workers

### 1.2 現有 API 端點分析
目前系統使用 Google Sheets 作為數據源的端點：

#### 訂單管理相關
1. `GET /api/get_orders_from_sheet.php` - 讀取所有訂單
2. `POST /api/update_order_status.php` - 更新訂單狀態  
3. `POST /api/update_payment_status.php` - 更新付款狀態
4. `POST /api/update_order_items.php` - 更新訂單項目
5. `POST /api/delete_order.php` - 刪除單一訂單
6. `POST /api/batch_delete_orders.php` - 批量刪除訂單

#### 客戶管理相關
1. `GET /api/get_customers_from_sheet.php` - 讀取客戶資料
2. `GET /api/get_customer_orders.php` - 獲取客戶訂單歷史

#### 管理員相關
1. `POST /api/admin_login.php` - 管理員登入
2. `GET /api/get_admin_dashboard.php` - 管理員面板數據

### 1.3 Supabase 資源現狀
已配置的 Supabase 表格：
- `orders` - 訂單表
- `customers` - 客戶表  
- `order_items` - 訂單項目表
- `admin_users` - 管理員表
- `products` - 商品表
- 完整的 RLS 政策已設置

## 2. 遷移需求分析

### 2.1 主要目標
- **主數據源**: Supabase Database
- **輔助數據源**: Google Sheets（保留作為備份或特殊需求）
- **無縫切換**: 前端代碼最小化修改
- **性能提升**: 利用 Supabase 的查詢性能
- **擴展性**: 為未來功能預留空間

### 2.2 數據遷移策略
1. **漸進式遷移**: 先遷移讀取操作，再遷移寫入操作
2. **雙寫機制**: 初期階段同時寫入 Supabase 和 Google Sheets
3. **降級策略**: 當 Supabase 不可用時，自動降級到 Google Sheets

## 3. 技術方案設計

### 3.1 新的 Cloudflare Workers 端點設計

#### 核心服務層
```typescript
// SupabaseService.ts - 統一的 Supabase 操作服務
class SupabaseService {
  - 連接 Supabase
  - 統一錯誤處理
  - 快取機制
  - 查詢優化
}
```

#### 新 API 端點對應
```
Google Sheets API → Supabase API
/api/get_orders_from_sheet.php → /orders
/api/update_order_status.php → /orders/{id}/status  
/api/update_payment_status.php → /orders/{id}/payment
/api/update_order_items.php → /orders/{id}/items
/api/delete_order.php → /orders/{id}
/api/batch_delete_orders.php → /orders/batch-delete
/api/get_customers_from_sheet.php → /customers
/api/get_customer_orders.php → /customers/{phone}/orders
/api/admin_login.php → /auth/login
/api/get_admin_dashboard.php → /dashboard/stats
```

### 3.2 數據同步機制

#### 主-輔模式設計
```typescript
interface DataSyncStrategy {
  primary: 'supabase';
  fallback: 'google-sheets';
  syncMode: 'write-through' | 'write-behind' | 'read-through';
}
```

#### 同步流程
1. **寫入操作**: 主要寫入 Supabase，成功後異步同步到 Google Sheets
2. **讀取操作**: 優先從 Supabase 讀取，失敗時降級到 Google Sheets
3. **一致性保證**: 定期同步檢查，確保數據一致性

### 3.3 前端服務層修改

#### orderService.ts 重構
```typescript
// 新的 API 端點配置
const API_ENDPOINTS = {
  supabase: {
    orders: '/orders',
    orderStatus: '/orders/{id}/status',
    // ...
  },
  googleSheets: {
    orders: '/api/get_orders_from_sheet.php',
    // 保留為備用
  }
};

// 自動降級機制
const fetchWithFallback = async (primaryEndpoint, fallbackEndpoint, options) => {
  try {
    return await fetch(primaryEndpoint, options);
  } catch (error) {
    console.warn('Primary API failed, falling back to Google Sheets');
    return await fetch(fallbackEndpoint, options);
  }
};
```

## 4. 實施步驟

### 階段 1: 基礎設施準備 (Day 1-2)
1. **Supabase 服務層開發**
   - 創建 `SupabaseService.ts`
   - 實現基本 CRUD 操作
   - 添加錯誤處理和重試機制

2. **環境配置**
   - 更新 `wrangler.jsonc` 添加 Supabase 配置
   - 配置必要的環境變數和密鑰

### 階段 2: 讀取操作遷移 (Day 3-5)
1. **訂單讀取遷移**
   - 實現 `GET /orders` 端點
   - 修改 `fetchOrders()` 函數使用新端點
   - 保留 Google Sheets 作為降級選項

2. **客戶資料讀取遷移**
   - 實現 `GET /customers` 端點
   - 修改 `fetchCustomers()` 函數

3. **統計數據遷移**
   - 實現 dashboard 統計端點
   - 優化查詢性能

### 階段 3: 寫入操作遷移 (Day 6-8)
1. **訂單狀態更新**
   - 實現 `PUT /orders/{id}/status`
   - 實現 `PUT /orders/{id}/payment`
   - 添加雙寫機制（Supabase + Google Sheets）

2. **訂單項目管理**
   - 實現 `PUT /orders/{id}/items`
   - 實現 `DELETE /orders/{id}`
   - 實現 `DELETE /orders/batch-delete`

### 階段 4: 管理功能遷移 (Day 9-10)
1. **管理員認證**
   - 實現基於 Supabase 的認證系統
   - 遷移管理員登入邏輯

2. **完整性測試**
   - 端到端測試
   - 性能測試
   - 數據一致性檢查

### 階段 5: 優化與監控 (Day 11-12)
1. **性能優化**
   - 查詢優化
   - 快取策略調整
   - 批量操作優化

2. **監控設置**
   - API 性能監控
   - 錯誤率監控
   - 數據同步狀態監控

## 5. 風險評估與應對

### 5.1 主要風險
1. **數據不一致**: Supabase 與 Google Sheets 數據可能出現差異
2. **性能影響**: 遷移過程中可能影響系統性能
3. **回滾困難**: 如果 Supabase 出現問題，需要快速回滾

### 5.2 應對策略
1. **數據一致性**
   - 實施嚴格的數據驗證
   - 定期同步檢查
   - 異常時自動降級

2. **性能保障**
   - 分階段遷移，避免系統大範圍中斷
   - 保留快取機制
   - 負載測試驗證

3. **回滾計劃**
   - 保留完整的 Google Sheets 備份
   - 實現一鍵切換機制
   - 準備回滾腳本

## 6. 成功指標

### 6.1 技術指標
- API 響應時間 < 500ms (P95)
- 系統可用性 > 99.9%
- 數據一致性 > 99.99%
- 錯誤率 < 0.1%

### 6.2 業務指標
- 用戶體驗無明顯降級
- 管理效率提升 > 20%
- 系統維護成本降低 > 30%

## 7. 後續發展規劃

### 7.1 短期優化 (1-3個月)
- 實時數據同步
- 高級查詢和分析功能
- 移動端支持優化

### 7.2 長期規劃 (3-12個月)
- 微服務架構
- 多租戶支持
- AI 驅動的智能分析

## 8. 總結

本遷移方案採用漸進式、風險可控的方式，確保：
1. **業務連續性**: 遷移過程中系統正常運行
2. **性能提升**: 利用 Supabase 的優勢提升系統性能
3. **擴展性**: 為未來功能發展奠定基礎
4. **風險可控**: 完善的降級和回滾機制

建議按照上述階段逐步實施，每個階段完成後進行充分測試，確保系統穩定性。