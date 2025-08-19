## Google Sheets → Supabase 遷移待辦清單（依程式碼現況產出）

本清單對準目前程式碼狀態，列出尚未完成或需強化之步驟，供後續按步驟實作與驗收。開發請遵循 `spec.md`。

---

## 目標與範圍

- 目標：將 Google Sheets（`Sheet1`、`客戶名單`）中的資料穩定、可重入地導入 Supabase，並提供可視化遷移結果與驗證機制。
- 範圍：Edge Functions（遷移）、前端遷移面板、資料模型/約束、驗證與報表、（可選）最終讀取來源切換。

---

## 前置作業（環境/安全/設定）

- [ ] Workers `wrangler.jsonc` 修正 `CACHE_DURATION` 單位為秒（建議 "15"），避免過長 TTL 影響資料即時性
- [ ] Supabase 專案：確認 Edge Functions 已啟用，且可從外部以 Bearer Token 呼叫
- [ ] Edge Functions 環境變數設定
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `JWT_SECRET`
  - [ ] `GOOGLE_SERVICE_ACCOUNT_KEY`（完整 JSON 字串）
- [ ] 建立/檢核資料表與索引（若已有則核對型別、約束）
  - [ ] `orders(id uuid pk, order_number text unique, customer_name text, customer_phone text, delivery_method text, customer_address text, due_date date, delivery_time text, notes text, payment_method text, status text, payment_status text, total_amount numeric, google_sheet_id int unique, created_at timestamptz default now())`
  - [ ] `order_items(id uuid pk, order_id uuid fk→orders(id), product text, quantity int, price numeric, subtotal numeric, created_at timestamptz default now())`
  - [ ] `customers(id uuid pk, name text, phone text unique, address text, region text, delivery_method text, contact_method text, social_id text, created_at timestamptz default now())`
  - [ ] 重要索引：`orders(google_sheet_id) unique`、`customers(phone) unique`、必要外鍵/索引

---

## Edge Function：`migrate-sheets-data` 強化與完成

現況：僅處理 `Sheet1` → `orders`，`migrateCustomers` 已實作但未使用，尚未處理 `order_items` 結構化。

### A. 讀取與遷移 Customers（客戶名單）

- [ ] 在 `supabase/functions/migrate-sheets-data/index.ts` 中啟用 `migrateCustomers` 流程（目前僅 orders）
- [ ] 從 `客戶名單` 讀取並映射欄位（姓名/電話/地址/取貨方式/聯繫方式/社交ID/訂單時間）
- [ ] Phone 正規化（僅保留數字；用於 `unique` 與比對）
- [ ] `upsert(customers, onConflict: 'phone')`，支援 `skipExisting`
- [ ] `dryRun` 模式輸出預計新增/更新計數與樣本資料（勿寫入）

驗收標準：
- dryRun 輸出包含 `customersProcessed` 計數且不寫入
- 正式執行可多次重跑，不重複插入（phone 唯一）

### B. 結構化 Order Items（從購買項目字串）

- [ ] 解析 `Sheet1` I 欄（購買項目）字串為 `{product, quantity, price?, subtotal}` 陣列
  - 建議規則：以逗號/頓號分段；以 `x|X|×` 拆分數量；若缺價則可為 0
- [ ] 在 upsert `orders` 後，為每筆 order（透過 `google_sheet_id` 取回 id）批量 `upsert order_items`
- [ ] 保持冪等性：同一 `order_id + product + quantity + price` 視為相同（可選擇以 `(order_id, product, quantity, price)` 做唯一索引）
- [ ] 允許 `dryRun` 僅輸出解析結果統計

驗收標準：
- 相同 Sheet 行重複遷移不會插入重複 item
- 可從 DB 查得 items 與 `orders.total_amount` 之和合理（允許差異，暫不強制對帳）

### C. 錯誤處理與批次/重試

- [ ] 將 Google API 呼叫與 DB 寫入包裝重試（指數退避，最多 3 次）
- [ ] 分批處理（建議每批 200-500 行），避免時間過長或記憶體壓力
- [ ] `stats.errors` 收集每筆錯誤訊息，完整返回於回應 JSON

### D. 遷移選項擴充（非必須但建議）

- [ ] `rangeOrders`/`rangeCustomers`（允許指定 Sheet 名稱與讀取範圍）
- [ ] `sinceRow` 與 `limit`（增量遷移）
- [ ] `truncate` 安全開關（僅限管理者、非預設）：清空後重建（需三重確認）

---

## 前端整合：`MigrationPanel` 與服務層

- [ ] `src/components/MigrationPanel.tsx`（若已存在）串接 `migrateGoogleSheetsData` 並呈現：
  - [ ] 輸入：`sheetId`、`dryRun`、`skipExisting`
  - [ ] 執行結果摘要（ordersProcessed / customersProcessed / productsProcessed / errors）
  - [ ] 錯誤列表/下載 JSON
  - [ ] 執行期間 Loading 與中止（可先不做中止）
- [ ] `src/services/secureApiService.ts` 顯示/處理 401：清除 token 並導回 `/admin`
- [ ] `src/services/migrationService.ts` 擴充：
  - [ ] 透過 `validateMigrationData()` 顯示 DB 計數（orders/customers/order_items）
  - [ ] 比對 Sheet 行數（可加一個 Workers 端輔助端點或直接 Edge Functions 中取得）

---

## 資料品質與驗證

- [ ] Phone 正規化工具（Edge Functions 與前端共用邏輯）
- [ ] Date 解析支援多格式（已實作 `parseDate`，補足錯誤樣本）
- [ ] 以 `validateMigrationData` 在 UI 顯示：
  - [ ] ordersCount / customersCount / productsCount（order_items）
  - [ ] 差異報告：Sheet vs DB 行數對比（可選）
- [ ] 典型測試用例：
  - [ ] 空白列/錯誤日期/不規則購買項目字串
  - [ ] 重複電話（應 upsert）
  - [ ] 重複執行遷移（冪等）

---

## 欄位/約束與資料庫面向

- [ ] 建立/檢核資料庫約束與索引：
  - [ ] `orders.google_sheet_id unique`
  - [ ] `customers.phone unique`
  - [ ] `order_items.order_id fk`、（可選）`(order_id, product, quantity, price) unique`
- [ ] 產生/更新遷移 SQL（位於 `supabase/migrations/`）
- [ ] 寫一份 `seeds`/`fixtures`（可選）

---

## 安全與權限

- [ ] Edge Functions 僅接受含有效 Admin JWT 的請求
- [ ] JWT 簽章與過期驗證（`validateJWT` 已有，補錯誤資訊與單元測試）
- [ ] 日誌去識別化（避免紀錄敏感資訊）

---

## 觀測與回報

- [ ] Edge Functions：計時/計數日誌（orders 條數、customers 條數、耗時）
- [ ] 錯誤事件集中（方便追蹤）
- [ ] 前端：顯示遷移摘要與錯誤明細

---

## （可選）最終讀取來源切換計畫（Phase 2）

- [ ] Workers 端新增 Supabase 讀取端點（以 `SupabaseService.ts`）：
  - [ ] `GET /api/orders` 改為從 Supabase 讀（支援分頁/篩選/排序）
  - [ ] `GET /api/customers` 改為從 Supabase 讀
  - [ ] `GET /api/customers/orders?phone=...` 改為從 Supabase 查詢
- [ ] 前端 `orderService.ts`/`customerService.ts` 增加切換旗標（readFrom: 'sheets' | 'supabase'）
- [ ] 漸進式切換與回滾方案

驗收標準：切換後功能/統計一致（允許微小浮動），可一鍵回退到 Sheets 流程。

---

## 驗收清單（Definition of Done）

- [ ] `migrate-sheets-data` 同時支援 Orders/Customers/OrderItems，且具 `dryRun/skipExisting` 與冪等性
- [ ] 前端 MigrationPanel 可視化結果並能反覆執行
- [ ] `validateMigrationData` 顯示 DB 計數與（可選）Sheet 對比
- [ ] 必要索引/唯一鍵/外鍵齊備；重跑不重複
- [ ] 文件更新：`spec.md`、本 `todo.md` 進度標記

---

## 檔案與修改導引（按步驟落地）

- Edge Functions：
  - `supabase/functions/migrate-sheets-data/index.ts`
    - 啟用 `migrateCustomers`、新增 `order_items` upsert、批次/重試、參數擴充

- 前端：
  - `src/components/MigrationPanel.tsx`（顯示與操作）
  - `src/services/secureApiService.ts`（401 流程、引數傳遞）
  - `src/services/migrationService.ts`（驗證顯示與錯誤處理）

- DB/Schema：
  - `supabase/migrations/*.sql`（表/索引/外鍵/唯一鍵）

---

## 里程碑節點（Checkpoints）

- [ ] CP1：Customers 遷移打通（dryRun/正式）
- [ ] CP2：OrderItems 結構化遷移完成（冪等）
- [ ] CP3：前端遷移面板完整呈現（含錯誤與下載）
- [ ] CP4：驗證數據面板完成（DB 計數/對比）
- [ ] CP5：Phase 2 讀取來源切換 PoC（可回退）


