# Google Sheets 到 Supabase 遷移方案（強化版）

本文件在原方案基礎上，補強了資料模型映射、RLS 與安全策略、雙寫/降級的具體實作細節、觀測性設計、灰度切換與回滾計畫、測試與驗收清單，以及明確的實施里程碑與風險對應手冊，目標是讓遷移方案可立即落地執行，並在風險可控下快速迭代。

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
   - 讀取：Supabase 失敗時自動切 Sheets（有熔斷與回復探測）。
   - 寫入：可按功能旗標切換為雙寫/只寫 Supabase/暫時寫 Sheets。
4. **契約穩定性**：維持前端 API 介面不變或提供 v1/v2 並行一段時間，透過 Accept-Version 或路徑前綴控制。
5. **資料一致性保證**：提供「對賬作業」與「自動補償作業」：每日 CRON 校驗差異並重放補償。

## 3. 技術方案設計（強化）

### 3.1 新的 Cloudflare Workers 端點設計與分層

- Handler 層：負責路由、驗證與序列化（Hono + zod）。
- Service 層：SupabaseService、SheetsService、CacheService、SyncService。
- Repository 層：封裝資料實際操作（SQL/REST）。
- Feature Flags：使用環境變數與 KV 控制（例如 FEATURE_SUPABASE_READ、FEATURE_DUAL_WRITE）。

#### 核心服務層（補強範例）
```typescript
// SupabaseService.ts（Workers 環境）
import { createClient } from '@supabase/supabase-js'

export class SupabaseService {
  private client;
  constructor(env: Env) {
    this.client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'X-Client-Info': 'sheet-order-migrator/1.0' }},
    });
  }

  async getOrders(params: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const page = params.page ?? 1;
    const size = Math.min(params.pageSize ?? 50, 200);
    let q = this.client.from('orders').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * size, page * size - 1);
    if (params.status) q = q.eq('status', params.status);
    if (params.search) q = q.ilike('customer_name', `%${params.search}%`);
    const { data, error, count } = await q;
    if (error) throw error;
    return { data, count };
  }

  async updateOrderStatus(id: string, status: string) {
    const { error } = await this.client.from('orders').update({ status }).eq('id', id);
    if (error) throw error;
  }
}
```

#### 新 API 端點對應（加入版本與查詢能力）
```
Google Sheets API → Supabase API（建議提供 /v1/ 與 /v2/ 並行）
/api/get_orders_from_sheet.php → GET /v1/orders?status=&search=&page=&pageSize=
/api/update_order_status.php   → PUT /v1/orders/{id}/status
/api/update_payment_status.php → PUT /v1/orders/{id}/payment
/api/update_order_items.php    → PUT /v1/orders/{id}/items
/api/delete_order.php          → DELETE /v1/orders/{id}
/api/batch_delete_orders.php   → POST /v1/orders/batch-delete
/api/get_customers_from_sheet.php → GET /v1/customers?search=&region=
/api/get_customer_orders.php      → GET /v1/customers/{phone}/orders
/api/admin_login.php              → POST /v1/auth/login
/api/get_admin_dashboard.php      → GET /v1/dashboard/stats
```
- 支援分頁、排序、篩選（Query 參數標準化）。
- 回應結構具備 request_id、trace 標頭，便於追蹤。

### 3.2 數據同步機制（強化）

#### 主-輔模式設計
```typescript
interface DataSyncStrategy {
  primary: 'supabase';
  fallback: 'google-sheets';
  syncMode: 'write-behind'; // 先回應使用者，再背景同步
  retry: { maxAttempts: number; backoffMs: number };
  deadLetter: 'kv' | 'queue';
}
```

#### 同步流程（具體化）
1. 寫入：Worker handler → Supabase 成功 → 丟入 Queue（或 KV 清單） → 背景消費者呼叫 Sheets API → 失敗寫入 Dead Letter 並告警。
2. 讀取：優先 Supabase，捕獲錯誤即轉 Sheets；若熔斷器開啟則直接 Sheets；定期健康檢查恢復。
3. 一致性：
   - CRON 作業每日對賬：以 Supabase 為源，對比 Sheets 筆數、關鍵欄位哈希。
   - 差異補償：生成補償任務重放；重試上限後人工處理清單。

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

## 4. 實施步驟（可執行里程碑與交付物）

### 階段 1: 基礎設施準備 (Day 1-2)
交付物：SupabaseService、Feature Flags、環境設定、基礎監控
1. Supabase 服務層
   - 建立 `SupabaseService.ts`、`Repository` 介面；封裝分頁/排序/條件查詢。
   - 錯誤標準化（含 request_id、error_code）。
2. 環境與旗標
   - `wrangler.jsonc`：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、FEATURE_SUPABASE_READ、FEATURE_DUAL_WRITE。
   - KV: `feature_flags`、`sync_dead_letter`。
3. 監控初版
   - 在 Handler 加入計時與標頭（X-Response-Time、X-Request-ID）。
   - Cloudflare Analytics/Logpush 指標打點設計。

### 階段 2: 讀取操作遷移 (Day 3-5)
交付物：GET 端點（Orders/Customers/Dashboard）+ 前端讀取切換
1. 訂單讀取
   - GET `/v1/orders`（分頁、篩選、排序），前端 `fetchOrders()` 先讀 Supabase，失敗再回退 Sheets。
   - 回應結構統一（增加 total、page、pageSize）。
2. 客戶讀取
   - GET `/v1/customers`（search、region）。
3. 儀表板統計
   - GET `/v1/dashboard/stats`：利用 Supabase SQL 聚合；同時保留快取（KV）15-60 秒。

### 階段 3: 寫入操作遷移 (Day 6-8)
交付物：PUT/POST/DELETE 端點 + 雙寫背景同步 + Dead Letter
1. 訂單狀態與付款
   - PUT `/v1/orders/{id}/status`、`/payment`：先寫 Supabase → push queue → 背景同步 Sheets。
2. 訂單項目與刪除
   - PUT `/v1/orders/{id}/items`、DELETE 單筆/批次。
3. 背景同步
   - Queue 消費者或 CRON Worker：冪等處理（使用 operation_id 去重）、指數退避重試、失敗入 Dead Letter KV。

### 階段 4: 管理功能遷移 (Day 9-10)
交付物：管理員認證/授權 + E2E + 對賬工具
1. 管理員認證
   - 改用 Supabase Auth（或服務端簽發短期 JWT），並於 Workers 驗證。
   - 管理端點採用 RLS 例外（Service Role）或 RPC 專用安全通道。
2. 測試與對賬
   - E2E 流程測試（下單→更新→刪除→讀取統計）。
   - 對賬工具：導出 Supabase 與 Sheets 數據計算校驗和，生成差異報告。

### 階段 5: 優化與監控 (Day 11-12)
交付物：監控儀表板、告警閾值、運維手冊
1. 性能優化
   - 熱查詢加索引；儀表板聚合使用物化視圖或預計算快取。
   - 大列表分頁改為 keyset pagination（避免偏移大）。
2. 監控與告警
   - Cloudflare Analytics、Logpush 建儀表板（P95/P99 延遲、錯誤率、熔斷次數、降級比率）。
   - Dead Letter 堆積量告警、重試失敗告警、資料對賬差異告警。
3. 運維手冊（Runbook）
   - 熔斷開關、功能旗標切換流程、回滾腳本操作指南。

## 5. 風險評估與應對（強化）

### 5.1 主要風險
1. **數據不一致**: Supabase 與 Google Sheets 數據可能出現差異
2. **性能影響**: 遷移過程中可能影響系統性能
3. **回滾困難**: 如果 Supabase 出現問題，需要快速回滾

### 5.2 應對策略（可操作）
1. 數據一致性
   - 寫入冪等：所有寫入帶 operation_id，重試不重複。
   - 對賬 CRON：每日 02:00 比對，產出差異清單與補償任務。
2. 性能保障
   - Canary 灰度：按百分比流量逐步開啟 FEATURE_SUPABASE_READ。
   - 壓測基準：以 2x 峰值流量壓測，確保 P95 < 500ms。
3. 回滾計劃（Runbook 摘要）
   - 一鍵切換：關閉 FEATURE_DUAL_WRITE、FEATURE_SUPABASE_READ → 完全回退 Sheets。
   - 清理：取消隊列中的未處理同步任務（保留 Dead Letter 以便後續補償）。

## 6. 成功指標（量化與告警閾值）

### 6.1 技術指標
- API 響應時間 P95 < 500ms，P99 < 900ms（若超過 5 分鐘觸發告警）
- 可用性 > 99.9%（計算期內）
- 對賬一致率 > 99.99%（若低於 99.95% 觸發告警）
- 端點錯誤率 < 0.1%（若 >0.3% 15 分鐘觸發告警）

### 6.2 業務指標
- 用戶體驗無明顯降級
- 管理效率提升 > 20%
- 系統維護成本降低 > 30%

## 7. 後續發展規劃（補強）

### 7.1 短期優化 (1-3個月)
- 實時數據同步
- 高級查詢和分析功能
- 移動端支持優化

### 7.2 長期規劃 (3-12個月)
- 微服務架構
- 多租戶支持
- AI 驅動的智能分析

## 8. 安全與 RLS 策略（新增）

- RLS 原則：預設拒絕，按角色最小許可。
- 表級策略示例（Postgres）：
  - orders：僅 admin 可更新/刪除，viewer 可讀。
  - order_items：follow orders 權限。
- Service Role 僅在 Workers 端使用；前端使用匿名或使用者 JWT。
- 敏感環境變數只存於 Workers 環境，避免暴露於前端。

## 9. 資料模型映射與 DDL（新增）

- orders（關鍵欄位示意）：
  - id (uuid), order_number (text unique), customer_name (text), customer_phone (text indexed),
    status (text), payment_status (text), total_amount (numeric), created_at (timestamptz default now())
- customers：id、name、phone(unique+index)、region、created_at
- order_items：id、order_id(fk orders.id)、product、price、quantity、subtotal
- 索引建議：
  - orders(customer_phone), orders(created_at desc), orders(status)
  - order_items(order_id)

## 10. 灰度切換與回滾手冊（新增）

- 切換流程：
  1) 在低流量時段開啟 FEATURE_SUPABASE_READ=10% → 50% → 100%（觀察 15-30 分鐘）。
  2) 開啟 FEATURE_DUAL_WRITE，觀察 Dead Letter 與對賬結果。
  3) 覆蓋 100% 後觀察 24-48 小時再下線 Sheets 寫入。
- 回滾流程：
  1) 關閉 FEATURE_DUAL_WRITE 與 FEATURE_SUPABASE_READ。
  2) 開啟 FEATURE_SHEETS_ONLY（若提供）。
  3) 通知相關人員並保留對賬報表以便後續補償。

## 11. 測試與驗收清單（新增）

- 單元測試：Service/Repository 邏輯、錯誤處理、重試與冪等。
- 整合測試：端點契約、分頁、排序、降級、快取命中/未命中。
- E2E：核心用例全流程（建立/更新/刪除/統計/導出）。
- 壓測：讀寫混合 70/30，達到 2x 峰值與 SLA 要求。
- 對賬：隨機抽樣 500 筆核對欄位一致性。

## 12. 總結（更新）

本遷移方案在原有基礎上提供了可執行的工程細節、量化的成功指標、灰度/回滾手冊、以及完整的測試與對賬流程，確保：
1. 業務連續性：在任何階段均可快速降級至 Sheets。
2. 性能與穩定：以指標與告警驅動的迭代優化。
3. 擴展與安全：清晰的資料模型、索引與 RLS 策略。

請按照里程碑逐步落地，每階段均進行觀測與驗收，再推進下一階段。
