我正在做專案遷移，但有點複雜，情況如下:
1.後台:
==========
### 1.1 現有架構
- **前端**: React + TypeScript + Tailwind CSS
- **後端**: Cloudflare Workers + Google Sheets API
- **數據存儲**: Google Sheets（主要）+ Supabase（已配置，逐步接管）
- **API結構**: RESTful API 透過 Cloudflare Workers

補充（已落地）
- `sheet-order-api` Workers 內已配置 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`，用於服務端存取 Supabase。
- 前端 `src/integrations/supabase/client.ts` 已移除 `.env` 相依，直接指向專案實例（不在前端暴露 Service Role）。
- 管理端登入統一至 Edge Function `admin-auth`，前端以 `AuthProvider` 管理 `admin_token`，受保護路由透過 `ProtectedRoute` 實作，支援登入後回導。

### 1.2 現有 API 端點分析
目前系統仍以 Google Sheets 為主要讀取，但已具備 Supabase 讀寫端點與產品 CRUD：

#### 訂單管理相關
1. `GET /api/get_orders_from_sheet.php` - 讀取所有訂單
2. `POST /api/update_order_status.php` - 更新訂單狀態  
3. `POST /api/update_payment_status.php` - 更新付款狀態
4. `POST /api/update_order_items.php` - 更新訂單項目
5. `POST /api/delete_order.php` - 刪除單一訂單
6. `POST /api/batch_delete_orders.php` - 批量刪除訂單

（Workers Supabase 版）
- `GET /api/orders.supabase`（已實作）- 由 `GetOrdersFromSupabase` 提供，供前端切換/回退。

#### 客戶管理相關
1. `GET /api/get_customers_from_sheet.php` - 讀取客戶資料
2. `GET /api/get_customer_orders.php` - 獲取客戶訂單歷史

#### 管理員相關
1. `POST /api/admin-auth`（Edge Function，已使用）- 管理員登入發 JWT
2. `GET /api/get_admin_dashboard.php` - 管理員面板數據（後續可改 Workers 端聚合）

#### 商品管理相關（新增）
- Workers 端點（已實作）：
  - `GET /api/products`
  - `POST /api/products`
  - `PUT /api/products`
  - `DELETE /api/products`
- Edge Function：`/functions/v1/products`（需 `Authorization: Bearer <admin_token>`）
- 前端：`ProductManagementPage.tsx` 優先走 `SecureApiService`（Edge Function），失敗回退 Supabase 直連，RLS 友善。

### 1.3 Supabase 資源現狀
已配置的 Supabase 表格：
- `orders` - 訂單表
- `customers` - 客戶表  
- `order_items` - 訂單項目表
- `admin_users` - 管理員表
- `products` - 商品表
- 完整的 RLS 政策已設置

補充（Workers 環境）：
- Cloudflare Workers `wrangler.jsonc` 已綁定 `CACHE_KV`、`GOOGLE_SHEET_ID`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 等。
- `SupabaseService` 服務層已提供 Orders/Customers 查詢與 Products CRUD 能力。

前端快取：
- `orderService.ts` 在記憶體內有 15 秒快取與強制刷新選項；Workers 端 `CacheService` 亦提供 15 秒 KV 快取。

## 2. 遷移需求分析（補強）

### 2.1 主要目標
- **主數據源**: Supabase Database
- **輔助數據源**: Google Sheets（保留作為備份或特殊需求）
- **無縫切換**: 前端代碼最小化修改
- **性能提升**: 利用 Supabase 的查詢性能
- **擴展性**: 為未來功能預留空間

### 2.2 數據遷移策略（補強）
1. **漸進式遷移**：先遷移讀取，再遷移寫入與變更；最後再下線 Sheets 寫入。
2. **雙寫機制（write-behind 首推）**：前端提交寫入 → 先寫 Supabase → 成功即回應 → 背景任務（Durable Object/Queue/CRON）同步寫入 Sheets（失敗重試並告警）。
3. **降級策略（feature flag + runtime fallback）**：
   - 讀取：Supabase 失敗時自動切 Sheets（現已在前端 `fetchOrders()` 以 fallback 實作，Workers 端亦可加入健康探測）。
   - 寫入：可按功能旗標切換為雙寫/只寫 Supabase/暫時寫 Sheets。
4. **契約穩定性**：維持前端 API 介面不變或提供 v1/v2 並行一段時間，透過 Accept-Version 或路徑前綴控制。
5. **資料一致性保證**：提供「對賬作業」與「自動補償作業」：每日 CRON 校驗差異並重放補償。

## 3. 技術方案設計（強化）

### 3.1 Cloudflare Workers 端點與分層（現況）

- Handler 層：負責路由、驗證與序列化（Hono + zod）。
- Service 層：SupabaseService、SheetsService、CacheService、SyncService。
- Repository 層：封裝資料實際操作（SQL/REST）。
- Feature Flags：使用環境變數與 KV 控制（例如 FEATURE_SUPABASE_READ、FEATURE_DUAL_WRITE）。
==========

2.前台:
系統架構概述
系統採用混合架構設計，前端使用現代化的 React 技術棧，後端使用 PHP 提供 API 服務，資料儲存主要依賴 Google Sheets，並整合第三方服務如簡訊通知等。

### 2.2 前端技術架構
#### 2.2.1 核心技術棧
- **框架**：React 18.2.0 (CDN 載入，輕量化部署)
- **樣式框架**：TailwindCSS 3.3.0 + 自定義 CSS
- **圖標庫**：Font Awesome 6.5.1 (完整圖標支援)
- **狀態管理**：React Hooks + localStorage
- **表單處理**：原生 JavaScript 驗證
- **HTTP 客戶端**：Fetch API
- **LINE LIFF SDK**：LINE 平台整合與環境偵測
- **環境適配**：智慧偵測 LIFF 環境與一般瀏覽器
- **統一入口**：單一 HTML 檔案支援多環境運行

#### 2.2.2 前端專案結構
```
前端檔案結構/
├── index.html              # 統一主頁面（整合 LIFF 相容性）
├── index-liff.html         # LIFF 專用頁面（待整合移除）
├── liff-order.html         # LIFF 訂購頁面（待整合移除）
├── app.js                  # 主要應用邏輯（含 LIFF 整合）
├── styles/                 # 樣式檔案目錄
│   ├── main.css           # 主要樣式檔案
│   ├── header.css         # 頁首樣式
│   ├── hero.css           # 主視覺樣式
│   ├── products.css       # 產品展示樣式
│   ├── order.css          # 訂購表單樣式
│   ├── admin.css          # 後台管理樣式
│   ├── floating-buttons.css # 浮動按鈕樣式
│   └── tailwind.css       # TailwindCSS 編譯檔
├── components/             # React 組件目錄
│   ├── Header.js          # 頁首組件
│   ├── Hero.js            # 主視覺組件
│   ├── BrandStory.js      # 品牌故事組件
│   ├── ProductCard.js     # 產品卡片組件
│   ├── OrderForm.js       # 訂購表單組件（LIFF 相容）
│   ├── Footer.js          # 頁尾組件
│   ├── FloatingButtons.js # 浮動按鈕組件
│   └── admin/             # 後台管理組件
│       ├── Login.js       # 登入組件
│       └── AdminDashboard.js # 管理面板組件
├── utils/                  # 工具函數目錄
│   ├── cityDistricts.js   # 縣市地區資料
│   ├── orderUtils.js      # 訂單處理工具
│   ├── sheetsUtils.js     # Google Sheets 工具
│   ├── adminUtils.js      # 後台管理工具
│   └── errorUtils.js      # 錯誤處理工具
├── dist/                   # 編譯後檔案
└── images/                 # 產品與品牌圖片
```

### 2.3 後端技術架構
#### 2.3.1 核心技術
- **語言**：PHP 7.4+ (穩定版本，廣泛支援)
- **API 架構**：RESTful API 設計
- **資料儲存**：Google Sheets API v4 (主要) + localStorage (會話)
- **認證方式**：Google Service Account + PHP Session
- **依賴管理**：Composer

#### 2.3.2 後端專案結構
```
後端檔案結構/
├── admin.php                    # 管理後台主頁
├── admin-dashboard-wrapper.php # 後台框架頁面
├── api/
│   ├── submit_order.php        # 訂單提交 API
│   ├── get_orders.php          # 取得訂單列表
│   ├── update_order_status.php # 更新訂單狀態
│   ├── delete_order.php        # 刪除訂單
│   ├── get_delivery_dates.php  # 取得可配送日期
│   └── admin_login.php         # 管理員登入驗證
├── includes/
│   ├── config.php              # 系統設定檔
│   ├── functions.php           # 共用函數
│   └── auth.php               # 認證相關函數
├── backend-dashboard/          # React 後台 Dashboard
│   ├── src/
│   ├── package.json
│   └── vite.config.js
└── service-account-key.json    # Google API 認證金鑰
```

### 2.4 第三方服務整合
#### 2.4.1 Google Sheets API
- **版本**：Google Sheets API v4
- **認證方式**：Service Account JSON 金鑰
- **權限範圍**：SPREADSHEETS (讀寫權限)
- **工作表結構**：
  - 主要訂單工作表 (15個欄位)
  - 客戶名單工作表 (8個欄位)
  - 配送日期設定工作表

#### 2.4.2 簡訊通知服務
- **服務商**：三竹簡訊 API
- **功能**：訂單確認簡訊自動發送
- **編碼**：UTF-8 支援中文簡訊
- **重試機制**：最多2次重試確保發送成功
- **防重複**：clientid 機制避免重複發送

### 2.5 資料庫設計 (Google Sheets)
#### 2.5.1 試算表結構
- **試算表 ID**：1BHlvdEp9FtJ8GcWQl2J_5YvMQNrXXXXXXXXXXXX (範例)
- **主要工作表**：
  - Sheet1：訂單資料 (15個欄位)
  - 客戶名單：客戶基本資料 (8個欄位)
  - 配送設定：可配送日期設定
  - 系統設定：系統參數設定
==========

我想透過claude code 幫我將這兩個專案 前端遷移到cloudflare pages + 後端遷移到workers 、google sheets遷移成Supabase 主+sheets輔的架構

請幫我分析以上內容，研究我該部屬那些Subagent在claude code輔助我



一、專案背景與目標

目標：將既有雙專案統一遷移到 Cloudflare 平台（前端→Pages、後端→Workers），將資料源切換為 Supabase 為主、Google Sheets 為輔，確保前端改動最小、性能提升、可擴展與穩定回退。
關鍵要求：
漸進式遷移：先讀後寫，最後下線 Sheets 寫入。
契約穩定：API 介面盡量不變或提供 v1/v2 並存。
降級與雙寫：Supabase 為主，必要時自動回退 Sheets；寫入採雙寫（背景同步）。
一致性保障：每日對賬 + 自動補償重放。
二、現況快照

後台（已落地要點）
前端：React + TypeScript + Tailwind CSS。
後端：Cloudflare Workers + Google Sheets API（主讀）；已接 Supabase。
Workers：已綁定 CACHE_KV / GOOGLE_SHEET_ID / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY。
登入：Edge Function admin-auth 下發 JWT；前端以 AuthProvider 管理 admin_token，ProtectedRoute 控管。
商品：Workers 已有 /api/products CRUD；Edge Function /functions/v1/products 需 Authorization。
快取：前端 orderService 記憶體 15 秒；Workers KV 亦 15 秒。
前台（獨立站點）
React 18（CDN 載入）、Tailwind 3.3 + 自訂 CSS、Fetch API、LIFF 支援、單頁入口。
後端：以 PHP API 提供服務，資料源為 Google Sheets（Service Account）。
簡訊：三竹 API（UTF-8、最多 2 次重試、防重複 clientid）。
Supabase 現況
表：orders / customers / order_items / admin_users / products。
已設 RLS；Service Role 僅在 Workers 端使用，不暴露前端。
Workers Service 層具備 Orders/Customers 查詢與 Products CRUD。
三、既有 API 概覽

訂單（Sheets 為主）
GET /api/get_orders_from_sheet.php
POST /api/update_order_status.php
POST /api/update_payment_status.php
POST /api/update_order_items.php
POST /api/delete_order.php
POST /api/batch_delete_orders.php
訂單（Supabase 版）
GET /api/orders.supabase（已實作，供切換/回退）
客戶
GET /api/get_customers_from_sheet.php
GET /api/get_customer_orders.php
管理員
POST /api/admin-auth（Edge Function）
GET /api/get_admin_dashboard.php（可改 Workers 聚合）
商品
Workers：GET/POST/PUT/DELETE /api/products
Edge Function：/functions/v1/products（需 Bearer admin_token）
前端：SecureApiService 優先使用 Edge Function，失敗回退 Supabase 直連
四、目標雲端拓撲（期望架構）

Cloudflare Pages：部署管理端與前台（兩站可拆分或同域子路徑）。
Cloudflare Workers（Hono + zod）：
Handler：路由、驗證、序列化
Service：SupabaseService、SheetsService、CacheService、SyncService
Repository：封裝資料存取實作（SQL/REST）
Feature Flags：環境變數 + KV 控制（FEATURE_SUPABASE_READ、FEATURE_DUAL_WRITE 等）
Supabase：主數據源（RLS、Edge Token、Service Role 僅 server side）
Google Sheets：輔助/備援，透過 CRON/Queue 進行對賬與補償
五、遷移策略與機制

漸進式：先將讀取切 Supabase（保留 Sheets 回退），再逐步將寫入改為 Supabase 主寫 + 背景雙寫 Sheets。
雙寫（write-behind 建議）：前端提交→Workers 寫 Supabase→立即回應→背景同步寫 Sheets（失敗重試 + 告警）。
降級策略：
讀取：Supabase 健康度不佳 → 自動切 Sheets（前端已做 fallback，Workers 可加健康探測）。
寫入：旗標控制雙寫/單寫 Supabase/臨時回退 Sheets。
契約穩定：維持現有路徑或提供 /v1 /v2，透過 Accept-Version 或路徑前綴。
一致性：每日 CRON 產出差異清單，補償重放；遇到衝突以 Supabase 為準，記錄審計日誌。
六、效能、快取與安全

快取：前端（短時記憶體 15s，可強制刷新）；Workers（KV 15s），需統一失效策略。
安全：JWT 驗證（admin-auth）、RLS（前端僅用 Edge Token；Service Role 僅 Workers 用）、避免在前端曝光敏感資訊。
觀測：為關鍵路由加上 tracing/logs/metrics；對雙寫失敗、回退率設定告警門檻。
七、需 GPT‑5 提案/決策事項

Workers 路由規劃：維持舊路徑或導入 /v2？如何在最小改動下過渡。
同步選型：Cloudflare Queues vs Durable Objects vs CRON（混合）用於 write-behind 與對賬重放。
資料對映：Sheets 欄位與 Supabase schema 的對映表、欄位型別、狀態機規範（訂單/付款/配送）。
前端切換策略：以 Feature Flag 控制資料源；錯誤/降級 UX（提示與重試）；是否導入 TanStack Query 做資料快取/重試策略。
權限：Edge Function 與 Workers 的 JWT 驗證中介層，管理端角色權限表（admin_users）與 RLS 對應策略。
監控：失敗率、回退比例、雙寫延遲、對賬差異量的 SLO/告警閾值與報表。
八、輸出與交付期望（請 GPT‑5 產出）

遷移路線圖與分階段工單（每階段成功標準、風險與回退方案）。
API 合約（v1/v2）與對映表（Sheets↔Supabase）。
Workers 實作藍圖：路由結構、Handler/Service/Repository 介面、Feature Flag 配置、錯誤碼與日誌格式。
同步方案細節：Queue/CRON 排程、重試與去重策略、審計與重放介面。
前端改造清單：最小改動清單、Fallback/重試/提示 UX、快取與失效策略。
DevOps：Cloudflare Pages/Workers 部署流程、Wrangler 配置、環境變數/密鑰管理、監控與告警設定。
九、成功驗收標準

讀取全面改走 Supabase，錯誤回退 Sheets 成功，P95 延遲下降。
寫入全面改走 Supabase，雙寫成功率 ≧ 99.9%，對賬差異＜ 0.1% 並可在 T+1 自動補償。
API 契約穩定，前端改動最小，無破壞性變更。
安全合規：Service Role 僅在 Workers；RLS 覆蓋 CRUD；敏感資料不在前端出現。
觀測完善：有可追蹤的日誌、指標、告警與報表。
十、使用說明（給 GPT‑5 的提示語）

角色：請扮演雲端/前後端架構師與遷移技術顧問。
邊界條件：維持前端最小改動與 API 契約穩定；Supabase 為主、Sheets 為輔；需可灰度/回退；注意安全與 RLS。
請輸出：完整遷移計畫、技術決策書、API/資料對映、同步流程、前端改造清單、部署與監控方案；每個章節提供清晰步驟與風險/回退策略。
—— 兩行超精簡版本（TL;DR）——

目標：前端→Cloudflare Pages、後端→Workers，資料源切 Supabase 主、Sheets 輔，保契約、可回退、雙寫同步、每日對賬。
交付：遷移路線圖、API/資料對映、Workers 分層實作藍圖、同步與監控方案、前端最小改動清單與部署守則。