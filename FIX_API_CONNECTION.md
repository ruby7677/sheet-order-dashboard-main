# 🔧 修復前端 API 連接問題

## 🎯 問題分析

**問題**: 前端網站 `https://sheet-order-dashboard-main.pages.dev/` 無法載入訂單資料

**原因**: 前端仍在嘗試從自己的域名取得 API 資料，而不是從我們的 Workers API

**當前狀態**:
- ✅ Workers API 正常: `https://sheet-order-api.ruby7677.workers.dev/api/get_orders_from_sheet.php`
- ❌ 前端 API 呼叫: `https://sheet-order-dashboard-main.pages.dev/api/get_orders_from_sheet.php` (不存在)

## 🔧 解決方案

### 步驟 1: 更新 GitHub 環境變數

前往 GitHub Repository: `https://github.com/ruby7677/sheet-order-dashboard-main`

**路徑**: Settings → Secrets and variables → Actions

#### 在 Secrets 頁籤新增:
```
Name: VITE_API_HOST
Value: https://sheet-order-api.ruby7677.workers.dev
```

#### 在 Variables 頁籤確認存在:
```
VITE_APP_ENV=production
VITE_API_BASE_URL=/api
VITE_GOOGLE_SHEET_ID=10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo
VITE_APP_TITLE=融氏古早味蘿蔔糕 - 訂單管理後台
VITE_APP_DESCRIPTION=蘿蔔糕訂購系統管理後台
VITE_CACHE_DURATION=15000
VITE_DEBUG_MODE=false
```

### 步驟 2: 觸發重新部署

推送任何小變更到 GitHub 主分支：

```bash
# 方法 1: 新增一個小註釋
git add .
git commit -m "feat: 連接 Cloudflare Workers API 完成前後端整合"
git push origin main

# 方法 2: 或者在 GitHub 網站上編輯任一檔案並提交
```

### 步驟 3: 等待部署完成

- GitHub Actions 會自動觸發
- Cloudflare Pages 會重新建置
- 新的環境變數會生效

## 🧪 預期結果

部署完成後，前端會：

1. **正確的 API 呼叫**:
   ```
   從: https://sheet-order-dashboard-main.pages.dev/api/get_orders_from_sheet.php
   到: https://sheet-order-api.ruby7677.workers.dev/api/get_orders_from_sheet.php
   ```

2. **成功載入資料**:
   - ✅ 訂單列表顯示
   - ✅ 客戶資料載入
   - ✅ 統計數據正確
   - ✅ 所有功能正常

## 🔍 驗證步驟

### 檢查環境變數載入

部署完成後，開啟前端網站，按 F12 開發者工具，在 Console 中應該看到：

```
當前 API 路徑: /api
```

並且在 Network 頁籤中，API 請求應該指向：
```
https://sheet-order-api.ruby7677.workers.dev/api/get_orders_from_sheet.php
```

### 測試功能

1. **訂單列表**: 應該顯示從 Google Sheets 載入的訂單
2. **統計資料**: 主頁面統計卡片顯示正確數字
3. **篩選功能**: 可以正常篩選訂單
4. **狀態更新**: 可以更新訂單和付款狀態
5. **批量操作**: 批量功能正常運作

## 🎊 完成後的架構

```
用戶 → Cloudflare Pages (前端)
       ↓ API 呼叫
     Cloudflare Workers (後端)
       ↓ 資料取得
     Google Sheets API
```

**前端**: `https://sheet-order-dashboard-main.pages.dev/`
**後端**: `https://sheet-order-api.ruby7677.workers.dev/`
**資料**: Google Sheets (`10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo`)

## 🏆 成功指標

- ✅ 前端網站正常載入
- ✅ 訂單資料顯示完整
- ✅ 所有 CRUD 操作正常
- ✅ 效能良好 (全球 CDN)
- ✅ 安全防護 (HTTPS + CORS)
- ✅ 零成本託管

完成這個步驟後，您的蘿蔔糕訂購系統就會是一個完全功能的現代化雲端應用！

---

**重要**: 一旦設定 `VITE_API_HOST`，前端就會使用這個值作為 API 基礎域名，所有 API 呼叫都會指向 Workers API。