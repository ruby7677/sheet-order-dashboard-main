# 蘿蔔糕訂購系統 - Cloudflare 遷移待辦清單

## 專案概述
將蘿蔔糕訂購系統從傳統 PHP 架構遷移至 Cloudflare Pages + Workers 現代化部署架構。

## 📊 進度摘要
- ✅ **P0 關鍵 API (4/4) 已完成**
  - 訂單查詢 API ✅
  - 客戶查詢 API ✅
  - 訂單狀態更新 API ✅
  - 付款狀態更新 API ✅
- ✅ **P1 進階 API (3/3) 已完成**
  - 訂單商品更新 API ✅
  - 單筆訂單刪除 API ✅
  - 批量刪除訂單 API ✅
- ✅ **P2 管理 API (3/3) 已完成**
  - 管理員登入 API ✅
  - 客戶訂單歷史 API ✅
  - 管理員儀表板 API ✅
- ❌ **P3 除錯 API (0/3) 待實作**
- ✅ **基礎建設 (3/4) 大部分完成**
  - Google Sheets API 整合 ✅
  - KV Store 快取系統 ✅
  - TypeScript 類型定義 ✅
  - CORS 安全設置 ❌

---

## 🔥 優先級一：核心 API 遷移

### A. 必要的 Workers API 端點 (P0 - 緊急)

#### A1. 訂單查詢 API
- **檔案**：`sheet-order-api/src/endpoints/getOrdersFromSheet.ts`
- **原始**：`api/get_orders_from_sheet.php`
- **功能**：
  - 從 Google Sheets 讀取訂單列表
  - 15秒快取機制
  - 支援強制刷新 (`refresh=1`)
  - 回傳格式：`{ success: true, data: Order[], timestamp, request_id }`
- **複雜度**：⭐⭐⭐
- **狀態**：✅ 已完成

#### A2. 客戶查詢 API
- **檔案**：`sheet-order-api/src/endpoints/getCustomersFromSheet.ts`
- **原始**：`api/get_customers_from_sheet.php`
- **功能**：
  - 從 Google Sheets「客戶名單」工作表讀取
  - 電話號碼去重與聚合
  - 區域分析與購買統計
- **複雜度**：⭐⭐⭐
- **狀態**：✅ 已完成

#### A3. 訂單狀態更新 API
- **檔案**：`sheet-order-api/src/endpoints/updateOrderStatus.ts`
- **原始**：`api/update_order_status.php`
- **功能**：
  - 更新訂單狀態 (訂單確認中/已抄單/已出貨/取消訂單)
  - 根據行索引定位訂單
  - 清除相關快取
- **複雜度**：⭐⭐⭐⭐
- **狀態**：✅ 已完成

#### A4. 付款狀態更新 API
- **檔案**：`sheet-order-api/src/endpoints/updatePaymentStatus.ts`
- **原始**：`api/update_payment_status.php`
- **功能**：
  - 更新付款狀態 (未收費/已收費/待轉帳/未全款/特殊)
  - P欄 (第16欄) 寫入
- **複雜度**：⭐⭐⭐
- **狀態**：✅ 已完成

### B. 進階操作 API (P1 - 高優先級)

#### B1. 訂單商品更新 API
- **檔案**：`sheet-order-api/src/endpoints/updateOrderItems.ts`
- **原始**：`api/update_order_items.php`
- **功能**：
  - 更新訂單商品清單
  - 重新計算總金額
  - 格式化商品字串 (產品名 x 數量)
- **複雜度**：⭐⭐⭐⭐
- **狀態**：✅ 已完成

#### B2. 單筆訂單刪除 API
- **檔案**：`sheet-order-api/src/endpoints/deleteOrder.ts`
- **原始**：`api/delete_order.php`
- **功能**：
  - 根據行索引刪除 Google Sheets 列
  - 安全性驗證
  - 快取失效處理
- **複雜度**：⭐⭐⭐⭐⭐
- **狀態**：✅ 已完成

#### B3. 批量刪除訂單 API
- **檔案**：`sheet-order-api/src/endpoints/batchDeleteOrders.ts`
- **原始**：`api/batch_delete_orders.php`
- **功能**：
  - 批量刪除多筆訂單
  - 回傳成功/失敗統計
  - 事務性操作 (盡力而為)
- **複雜度**：⭐⭐⭐⭐⭐
- **狀態**：✅ 已完成

### C. 管理與輔助 API (P2 - 中優先級)

#### C1. 管理員登入 API
- **檔案**：`sheet-order-api/src/endpoints/adminLogin.ts`
- **原始**：`api/admin_login.php`
- **功能**：
  - Session 驗證
  - JWT Token 簽發
  - 安全性檢查
- **複雜度**：⭐⭐⭐
- **狀態**：✅ 已完成

#### C2. 客戶訂單歷史 API
- **檔案**：`sheet-order-api/src/endpoints/getCustomerOrders.ts`
- **原始**：`api/get_customer_orders.php`
- **功能**：
  - 根據電話號碼查詢客戶所有訂單
  - 時間排序
  - 統計分析
- **複雜度**：⭐⭐
- **狀態**：✅ 已完成

#### C3. 管理員儀表板 API
- **檔案**：`sheet-order-api/src/endpoints/getAdminDashboard.ts`
- **功能**：
  - 提供管理員儀表板資料
  - 訂單統計與分析
  - 營收報表資料
- **複雜度**：⭐⭐⭐
- **狀態**：✅ 已完成

### D. 除錯與監控 API (P3 - 低優先級)

#### D1. 快取檢查 API
- **檔案**：`sheet-order-api/src/endpoints/checkCache.ts`
- **原始**：`api/check_cache.php`
- **功能**：除錯用，檢查 KV Store 快取狀態
- **複雜度**：⭐
- **狀態**：❌ 待實作

#### D2. API 路徑檢查
- **檔案**：`sheet-order-api/src/endpoints/checkApiPath.ts`
- **原始**：`api/check_api_path.php`
- **功能**：除錯用，檢查 API 可用性
- **複雜度**：⭐
- **狀態**：❌ 待實作

#### D3. API 存取測試
- **檔案**：`sheet-order-api/src/endpoints/testApiAccess.ts`
- **原始**：`api/test_api_access.php`
- **功能**：健康檢查端點
- **複雜度**：⭐
- **狀態**：❌ 待實作

---

## 🔧 優先級二：技術基礎建設

### E. Workers 開發環境設置

#### E1. Google Sheets API 整合
- **任務**：在 Workers 中配置 Google Client Library
- **需求**：
  - Service Account 憑證管理 (Secrets) ✅ 已完成
  - Google Sheets API v4 呼叫 ✅ 已完成
  - 錯誤處理與重試機制 ✅ 已完成
- **狀態**：✅ 已完成

#### E2. KV Store 快取系統
- **任務**：配置 Cloudflare KV Store 作為快取層
- **需求**：
  - 15秒快取策略 ✅ 已完成 (wrangler.toml 配置)
  - 快取鍵命名規範 ✅ 已完成
  - 自動過期與手動清除 ✅ 已完成
- **狀態**：✅ 已完成

#### E3. CORS 與安全性設置
- **任務**：配置跨域請求與安全標頭
- **需求**：
  - CORS 標頭設置
  - 請求驗證 (timestamp + nonce)
  - Rate limiting
- **狀態**：❌ 待實作

#### E4. TypeScript 類型定義
- **任務**：定義 Google Sheets 資料結構
- **檔案**：`sheet-order-api/src/types.ts`
- **需求**：
  - Order, Customer, OrderItem 介面 ✅ 已完成
  - Google Sheets API 回應格式 ✅ 已完成
  - 錯誤處理類型 ✅ 已完成
- **狀態**：✅ 已完成

### F. 前端 API 串接調整

#### F1. API URL 切換機制
- **任務**：完善 Workers API URL 切換
- **檔案**：
  - `src/services/orderService.ts`
  - `src/services/customerService.ts`
- **需求**：
  - 環境變數自動切換
  - 開發/生產環境支援
  - 錯誤回退機制
- **狀態**：🔄 部分完成 (目前硬編碼 Workers URL)

#### F2. 錯誤處理優化
- **任務**：適配 Workers API 回應格式
- **需求**：
  - 統一錯誤格式處理
  - 重試機制
  - 使用者友好的錯誤訊息
- **狀態**：❌ 待實作

---

## 📦 優先級三：部署與維運

### G. 部署流程優化

#### G1. Workers 自動部署
- **任務**：設置 GitHub Actions 自動部署 Workers
- **檔案**：`.github/workflows/deploy-workers.yml`
- **需求**：
  - 每次 push 自動部署
  - 環境變數管理 ✅ 已完成 (wrangler.toml 配置)
- **狀態**：🔄 部分完成 (環境變數已設定)
  - 部署狀態通知
- **狀態**：❌ 待實作

#### G2. 環境變數管理
- **任務**：設置 Cloudflare Workers 環境變數
- **需求**：
  - Google Service Account Key (Secret)
  - Google Sheets ID
  - KV Store 命名空間
  - API 版本號
- **狀態**：❌ 待實作

#### G3. 監控與日誌
- **任務**：設置 Workers 監控
- **需求**：
  - 錯誤日誌收集
  - 效能監控
  - 使用量統計
- **狀態**：❌ 待實作

---

## ⚠️ 技術挑戰與風險

### 🚨 高風險項目

1. **Google Sheets API 限制**
   - 每分鐘 100 次請求限制
   - 需實作智能重試與快取

2. **Workers 運行時限制**
   - CPU 時間限制 (10ms-30s)
   - 記憶體限制 (128MB)
   - 需優化大量資料處理

3. **批量操作複雜性**
   - Google Sheets 不支援事務
   - 需要錯誤恢復機制
   - 併發寫入衝突處理

### 🔍 需要研究的技術點

1. **Service Account 在 Workers 中的使用**
   - JWT 簽名與 Token 獲取
   - Secrets 管理最佳實務

2. **KV Store 使用模式**
   - 快取鍵設計
   - 過期策略
   - 一致性保證

3. **Google Sheets 大量寫入優化**
   - Batch Update API
   - 寫入順序最佳化
   - 錯誤處理策略

---

## 📝 開發規範

### 命名規範
- **Workers 端點**：`src/endpoints/{功能名稱}.ts`
- **類型定義**：統一放在 `src/types.ts`
- **工具函數**：`src/utils/{功能名稱}.ts`

### 程式碼規範
- **語言**：TypeScript (嚴格模式)
- **框架**：Hono + chanfana
- **錯誤處理**：統一的 try-catch 包裝
- **日誌**：console.log/error 配合 Workers 監控

### 測試策略
- **單元測試**：Jest + @cloudflare/workers-types
- **整合測試**：本地 Wrangler dev 環境
- **生產測試**：分階段部署驗證

---

## 🎯 里程碑時程規劃

### Phase 1: 核心 API 遷移 (預計 2-3 週)
- [ ] A1-A4: 基礎 CRUD API
- [ ] E1-E3: 基礎設施
- [ ] F1: 前端 API 切換

### Phase 2: 進階功能 (預計 1-2 週)
- [ ] B1-B3: 進階操作 API
- [ ] C1-C2: 管理功能

### Phase 3: 完善與監控 (預計 1 週)
- [ ] D1-D3: 除錯 API
- [ ] G1-G3: 部署與監控

### Phase 4: 測試與上線 (預計 1 週)
- [ ] 整合測試
- [ ] 效能測試
- [ ] 生產環境驗證
- [ ] DNS 切換

---

## 📈 成功指標

### 效能指標
- [ ] API 回應時間 < 500ms (95%)
- [ ] 全球邊緣延遲 < 100ms
- [ ] 快取命中率 > 80%

### 可靠性指標
- [ ] 99.9% 可用性
- [ ] 錯誤率 < 0.1%
- [ ] Google Sheets API 配額使用 < 80%

### 成本指標
- [ ] Workers 請求費用 < $10/月
- [ ] KV Store 費用 < $5/月
- [ ] 總體成本降低 > 70% (vs PHP 伺服器)

---

## 🤝 團隊分工建議

### 後端 Workers 開發
- 核心 API 端點實作
- Google Sheets 整合
- 快取機制設計

### 前端整合調整
- API 串接切換
- 錯誤處理優化
- 使用者體驗改善

### DevOps 與部署
- CI/CD 流程設置
- 環境變數管理
- 監控與警報配置

---

*最後更新：2024-12-20*  
*總預估工作量：40-60 小時*  
*建議團隊規模：2-3 人*