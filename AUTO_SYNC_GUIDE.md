# 自動同步系統使用說明

## 概述

本文檔說明如何使用新建立的自動同步系統，該系統可以定期自動將 Google Sheets 中的訂單和客戶資料同步到 Supabase 資料庫。

## 系統特色

### ✅ 已實現功能

1. **自動定時同步**
   - 每 2 小時自動執行一次同步
   - 支援訂單資料和客戶資料同步
   - CRON 觸發器自動處理

2. **增量同步機制**
   - 避免重複處理已同步的資料
   - 智能跳過已存在的記錄
   - 提高同步效率

3. **錯誤處理與監控**
   - 完整的錯誤日誌記錄
   - 同步狀態追蹤
   - 失敗重試機制

4. **手動觸發支援**
   - 前端管理面板手動觸發
   - API 端點直接調用
   - 試運行模式測試

## API 端點

### 自動同步 API

**POST** `/api/sync/auto`

觸發自動同步操作。

**請求參數：**
```json
{
  "forceFullSync": false,      // 是否強制完整同步
  "dryRun": false,            // 是否為試運行模式
  "syncOrders": true,         // 是否同步訂單
  "syncCustomers": true,      // 是否同步客戶
  "triggerType": "manual"     // 觸發類型：manual/cron
}
```

**回應格式：**
```json
{
  "success": true,
  "message": "自動同步完成",
  "stats": {
    "ordersProcessed": 10,
    "customersProcessed": 5,
    "productsProcessed": 25,
    "errors": []
  },
  "timestamp": "2025-08-22T10:00:00Z",
  "request_id": "uuid-here"
}
```

### 同步狀態查詢 API

**GET** `/api/sync/status`

查詢最近的同步記錄和狀態。

**回應格式：**
```json
{
  "success": true,
  "data": {
    "lastSyncTime": "2025-08-22T08:00:00Z",
    "lastSyncStatus": "completed",
    "recentSyncs": [
      {
        "timestamp": "2025-08-22T08:00:00Z",
        "status": "completed", 
        "operation": "AUTO_SYNC_COMPLETE",
        "message": null
      }
    ],
    "nextScheduledSync": null
  },
  "request_id": "uuid-here"
}
```

## 使用方式

### 1. 前端管理面板

進入管理後台的「資料遷移」頁面：

1. **查看自動同步狀態**
   - 最後同步時間
   - 同步狀態（正常/異常）

2. **手動觸發同步**
   - 點擊「立即同步」按鈕
   - 查看同步進度和結果

3. **更新狀態**
   - 點擊「更新狀態」獲取最新資訊

### 2. CRON 自動觸發

系統已配置為每 2 小時自動執行一次同步：

- **生產環境**：`0 */2 * * *` (每2小時)
- **開發環境**：`*/30 * * * *` (每30分鐘，用於測試)

### 3. API 直接調用

可以直接調用 API 進行同步：

```bash
# 手動觸發同步
curl -X POST https://your-worker.domain/api/sync/auto \
  -H "Content-Type: application/json" \
  -d '{
    "forceFullSync": false,
    "dryRun": false,
    "syncOrders": true,
    "syncCustomers": true,
    "triggerType": "manual"
  }'

# 查詢同步狀態
curl https://your-worker.domain/api/sync/status
```

## 同步邏輯

### 資料處理流程

1. **客戶資料同步**
   - 從 Google Sheets「客戶名單」工作表讀取
   - 電話號碼正規化處理
   - 根據電話號碼進行 upsert 操作
   - 跳過已存在的客戶（增量模式）

2. **訂單資料同步**
   - 從 Google Sheets「Sheet1」工作表讀取
   - 解析訂單基本資訊
   - 根據 google_sheet_id 進行 upsert 操作
   - 處理訂單項目（product, quantity, price）
   - 跳過已存在的訂單（增量模式）

3. **錯誤處理**
   - 記錄所有操作到 sync_logs 表
   - 失敗時保留錯誤訊息
   - 不中斷整體同步流程

### 資料映射

#### 客戶資料映射
| Google Sheets 欄位 | Supabase 欄位 | 說明 |
|-------------------|---------------|------|
| 姓名 | name | 客戶姓名 |
| 電話 | phone | 電話號碼（唯一鍵） |
| 取貨方式 | delivery_method | 配送方式 |
| 地址 | address | 配送地址 |
| 透過什麼聯繫賣家 | contact_method | 聯繫方式 |
| 社交軟體名字 | social_id | 社交帳號 |
| 訂單時間 | created_at | 建立時間 |

#### 訂單資料映射
| Google Sheets 欄位 | Supabase 欄位 | 說明 |
|-------------------|---------------|------|
| 列號 | google_sheet_id | Google Sheets 行號（唯一鍵） |
| 訂購者姓名 | customer_name | 客戶姓名 |
| 電話 | customer_phone | 客戶電話 |
| 取貨方式 | delivery_method | 配送方式 |
| 地址 | customer_address | 配送地址 |
| 到貨日期 | due_date | 預期到貨日期 |
| 宅配時段 | delivery_time | 配送時間 |
| 備註 | notes | 訂單備註 |
| 付款方式 | payment_method | 付款方式 |
| 訂單狀態 | status | 訂單處理狀態 |
| 付款狀態 | payment_status | 付款狀態 |
| 總金額 | total_amount | 訂單總金額 |
| 購買項目 | order_items | 訂單項目（解析後存入關聯表） |

## 監控與維護

### 同步日誌

所有同步操作都會記錄在 `sync_logs` 表中：

```sql
-- 查看最近的同步記錄
SELECT * FROM sync_logs 
WHERE table_name IN ('orders', 'customers', 'auto_sync')
ORDER BY created_at DESC 
LIMIT 10;

-- 查看失敗的同步操作
SELECT * FROM sync_logs 
WHERE sync_status = 'failed'
ORDER BY created_at DESC;
```

### 狀態檢查

定期檢查同步狀態：

1. **同步頻率**：確認每2小時有執行記錄
2. **錯誤率**：監控失敗的同步操作
3. **資料一致性**：比對 Google Sheets 與 Supabase 的資料筆數

### 故障排除

常見問題與解決方案：

1. **Google Sheets API 權限錯誤**
   - 檢查 Service Account 金鑰是否正確
   - 確認 Sheets 分享權限給 Service Account

2. **Supabase 連線錯誤**
   - 檢查 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
   - 確認資料庫表結構正確

3. **CRON 觸發器未執行**
   - 檢查 wrangler.toml 配置
   - 確認 Worker 部署成功

## 部署說明

### 環境變數配置

確保以下環境變數已正確設定：

```bash
# Google Sheets 相關
GOOGLE_SERVICE_ACCOUNT_KEY="..."  # Service Account JSON 金鑰
GOOGLE_SHEET_ID="..."            # Google Sheets ID

# Supabase 相關
SUPABASE_URL="..."               # Supabase 專案 URL
SUPABASE_SERVICE_ROLE_KEY="..."  # Service Role 金鑰

# 快取相關
CACHE_DURATION="15"              # 快取持續時間（秒）
```

### 部署指令

```bash
# 安裝依賴
cd sheet-order-api
npm install

# 部署到 Cloudflare Workers
npm run deploy

# 或使用 wrangler 直接部署
wrangler deploy --env production
```

### 驗證部署

部署完成後，驗證功能：

1. **API 可用性**：`curl https://your-worker.domain/api/sync/status`
2. **手動同步**：透過前端面板觸發同步
3. **CRON 觸發**：等待下一個整點確認自動執行

## 效益總結

### 解決的問題

✅ **訂單資料未自動同步**：現在訂單和客戶資料都會自動同步
✅ **手動操作繁瑣**：自動化減少人工干預
✅ **資料一致性問題**：增量同步避免重複和衝突
✅ **監控與追蹤**：完整的同步日誌和狀態追蹤

### 系統改進

- **可靠性**：重試機制和錯誤處理
- **效率**：增量同步減少不必要的操作
- **可觀測性**：詳細的日誌和狀態監控
- **可維護性**：清晰的架構和文檔

這個自動同步系統確保了 Google Sheets 和 Supabase 之間的資料一致性，大大降低了手動維護的工作量。