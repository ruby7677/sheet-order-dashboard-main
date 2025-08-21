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