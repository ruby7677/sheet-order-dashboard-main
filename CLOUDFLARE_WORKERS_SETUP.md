# 🔧 Cloudflare Workers API 設定指南

## 📍 配置檔案位置

`wrangler.toml` 位於：
```
workers-example/wrangler.toml
```

## ⚙️ 完整設定步驟

### 步驟 1: 安裝 Wrangler CLI
```bash
npm install -g wrangler
wrangler login
```

### 步驟 2: 建立 KV 命名空間
```bash
cd workers-example/

# 生產環境 KV
wrangler kv:namespace create "CACHE_KV"
# 輸出範例: 🌀 Creating namespace with title "sheet-order-api-CACHE_KV"
# ✨ Success! Created KV namespace with id "37c85c7f1aa84365810dc5ddb4015d47"

# 開發環境 KV  
wrangler kv:namespace create "CACHE_KV" --preview
# 輸出範例: 🌀 Creating namespace with title "sheet-order-api-CACHE_KV_preview"
# ✨ Success! Created KV namespace with id "b8d2c4e6f8a0b2d4e6f8a0b2d4e6f8a0"
```

### 步驟 3: 更新 wrangler.toml
將步驟 2 得到的 ID 更新到配置檔案：

```toml
# KV 命名空間 (用於快取)
[[kv_namespaces]]
binding = "CACHE_KV"
id = "37c85c7f1aa84365810dc5ddb4015d47"        # 👈 生產環境 ID
preview_id = "b8d2c4e6f8a0b2d4e6f8a0b2d4e6f8a0" # 👈 開發環境 ID
```

### 步驟 4: 設定 Google Service Account 金鑰
```bash
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY

# 系統會提示輸入，將 service-account-key2.json 的完整內容複製貼上
# 包含整個 JSON 結構，類似：
# {
#   "type": "service_account",
#   "project_id": "your-project",
#   "private_key_id": "...",
#   "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
#   "client_email": "...",
#   "client_id": "...",
#   ...
# }
```

### 步驟 5: 部署到 Cloudflare
```bash
# 部署到生產環境
wrangler deploy --env production

# 或部署到開發環境測試
wrangler deploy --env development
```

## 🎯 部署後的 API 端點

部署成功後，您的 API 將可在以下網址存取：

```
https://sheet-order-api.your-username.workers.dev/api/check_api_path.php
https://sheet-order-api.your-username.workers.dev/api/get_orders_from_sheet.php
```

## 📋 目前的配置說明

### ✅ 已配置項目
- **Worker 名稱**: `sheet-order-api`
- **主檔案**: `index.js`
- **Google Sheet ID**: `10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo`
- **KV 綁定**: `CACHE_KV` (用於快取)

### ⚠️ 需要更新的項目
1. **KV 命名空間 ID**: 第 17-18 行 (步驟 2)
2. **Google Service Account**: Secret 設定 (步驟 4)

### 🔧 可選配置
- **自定義域名**: 取消註解第 10-12 行，設定您的域名
- **快取清理**: 第 46-47 行的 cron job

## 🔗 更新前端 API 配置

部署成功後，需要更新 GitHub Secrets：

```bash
# 在 GitHub Repository → Settings → Secrets and variables → Actions
VITE_API_HOST=https://sheet-order-api.your-username.workers.dev
```

然後重新觸發 Cloudflare Pages 部署。

## 🧪 測試 API

```bash
# 測試 API 狀態
curl https://sheet-order-api.your-username.workers.dev/api/check_api_path.php

# 測試訂單資料
curl https://sheet-order-api.your-username.workers.dev/api/get_orders_from_sheet.php
```

## 💡 小提示

1. **開發環境**: 先用 `--env development` 測試
2. **日誌查看**: `wrangler tail` 可以查看即時日誌
3. **本地測試**: `wrangler dev` 可以本地執行
4. **KV 管理**: `wrangler kv:key list --namespace-id=你的ID` 查看快取

---

**下一步**: 完成這些步驟後，您的蘿蔔糕訂購系統將擁有完整的前後端架構！