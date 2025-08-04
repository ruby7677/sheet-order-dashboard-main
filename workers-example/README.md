# Cloudflare Workers API 部署

這個目錄包含將 PHP API 轉換為 Cloudflare Workers 的範例代碼。

## 🚀 快速開始

### 1. 安裝 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 2. 建立 KV 命名空間
```bash
# 生產環境
wrangler kv:namespace create "CACHE_KV"

# 開發環境  
wrangler kv:namespace create "CACHE_KV" --preview
```

### 3. 設定 Secrets
```bash
# 設定 Google Service Account 金鑰
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY

# 複製 service-account-key2.json 的完整內容並貼上
```

### 4. 更新 wrangler.toml
```toml
# 將 KV 命名空間 ID 更新到 wrangler.toml
[[kv_namespaces]]
binding = "CACHE_KV"
id = "你的_KV_命名空間_ID"
preview_id = "你的_預覽_KV_命名空間_ID"
```

### 5. 部署
```bash
# 開發環境部署
wrangler deploy --env development

# 生產環境部署
wrangler deploy --env production
```

## 🔧 配置說明

### 環境變數
- `GOOGLE_SHEET_ID`: Google Sheets 試算表 ID
- `APP_ENV`: 應用程式環境 (development/production)
- `CACHE_DURATION`: 快取持續時間 (毫秒)
- `DEBUG_MODE`: 除錯模式開關

### Secrets
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Google Service Account 完整 JSON 金鑰

## 📋 功能對應

| PHP 端點 | Workers 路由 | 狀態 |
|----------|-------------|------|
| `get_orders_from_sheet.php` | `/api/get_orders_from_sheet.php` | ✅ 已實作 |
| `update_order_status.php` | `/api/update_order_status.php` | 🚧 範例代碼 |
| `check_api_path.php` | `/api/check_api_path.php` | ✅ 已實作 |
| 其他端點 | - | ❌ 需要實作 |

## 🔍 測試

```bash
# 測試部署
curl https://sheet-order-api.your-subdomain.workers.dev/api/check_api_path.php

# 測試訂單取得
curl https://sheet-order-api.your-subdomain.workers.dev/api/get_orders_from_sheet.php
```

## ⚡ 效能特點 

- **全球邊緣運算**: 在全球 200+ 個數據中心運行
- **零冷啟動**: 比傳統 serverless 更快
- **KV 快取**: 分佈式鍵值儲存
- **免費額度**: 每日 100,000 請求

## 📝 注意事項

1. **JWT 簽署**: 使用 Web Crypto API，與 Node.js 略有不同
2. **快取策略**: 使用 Cloudflare KV 替代檔案快取
3. **CORS 處理**: 需要在每個回應中加入 CORS headers
4. **錯誤處理**: 統一的錯誤回應格式

## 🔗 相關資源

- [Cloudflare Workers 文檔](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文檔](https://developers.cloudflare.com/workers/wrangler/)
- [KV 儲存文檔](https://developers.cloudflare.com/workers/runtime-apis/kv/)