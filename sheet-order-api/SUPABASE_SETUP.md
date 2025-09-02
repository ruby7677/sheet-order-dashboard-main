# Supabase 環境變數設置指南

## 概述

商品管理功能需要 Cloudflare Workers 連接到 Supabase 資料庫。為了安全性考慮，Supabase Service Role Key 需要使用 Cloudflare Secrets 功能來設置。

## 設置步驟

### 1. 取得 Supabase Service Role Key

1. 登入 [Supabase Dashboard](https://app.supabase.com/)
2. 選擇您的專案：`skcdapfynyszxyqqsvib`
3. 前往 `Settings` > `API`  
4. 複製 `service_role` 金鑰（非 `anon` 金鑰）

### 2. 設置 Cloudflare Secret

#### 方法 1：使用 Wrangler CLI（推薦）

```bash
# 進入 Workers 目錄
cd sheet-order-api

# 設置生產環境的 secret
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env production

# 設置開發環境的 secret
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env development

# 設置預設環境的 secret（本地開發）
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

#### 方法 2：使用 Cloudflare Dashboard

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 前往 `Workers & Pages`
3. 選擇您的 Worker：`sheet-order-api`
4. 前往 `Settings` 標籤
5. 在 `Environment Variables` 部分點選 `Add variable`
6. 設置：
   - Variable name: `SUPABASE_SERVICE_ROLE_KEY`
   - Variable value: [您的 Service Role Key]
   - Type: `Secret`

### 3. 驗證設置

設置完成後，重新部署 Worker：

```bash
cd sheet-order-api
npm run deploy
```

## 疑難排解

### 如果仍然無法儲存商品

1. **檢查 Supabase RLS 策略**：
   - 確保 `products` 表有適當的 RLS 策略
   - Service Role 應該能夠繞過 RLS 限制

2. **檢查錯誤訊息**：
   - 開啟瀏覽器開發者工具
   - 查看 Network 標籤中的 API 請求錯誤
   - 檢查 Console 標籤中的錯誤訊息

3. **本地測試**：
   ```bash
   cd sheet-order-api
   npm run dev
   ```
   檢查本地 Workers API (http://127.0.0.1:5714) 是否正常運作

### 安全注意事項

- **絕不要**將 Service Role Key 提交到代碼倉庫
- **絕不要**在前端代碼中使用 Service Role Key
- Service Role Key 具有完整的資料庫存取權限，請妥善保管

## 後備機制

即使 Workers API 無法使用，商品管理頁面也會自動降級到直接使用 Supabase 匿名連接。但這需要適當的 RLS 策略來允許匿名用戶的 CRUD 操作。