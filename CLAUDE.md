# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是一個蘿蔔糕訂購系統後台管理 Dashboard，採用 Cloudflare Pages + Cloudflare Workers 的現代化部署架構。前端使用 React + TypeScript + Tailwind CSS，後端 API 使用 Cloudflare Workers 部署，並串接 Google Sheets API 進行資料管理。

## 常用指令

### 前端開發
```powershell
# 安裝依賴
npm install

# 開發模式運行 (監聽 0.0.0.0:8080)
npm run dev

# 開發模式 (包含除錯資訊)
npm run dev:debug

# 清理快取後運行
npm run dev:clean

# 程式碼檢查
npm run lint

# 建置生產版本 (部署到 Cloudflare Pages)
npm run build

# 建置開發版本 (包含 source map)
npm run build:dev

# 預覽建置結果
npm run preview

# 清理建置檔案
npm run clean
```

### Cloudflare Workers API 開發
```powershell
# 進入 API 目錄
cd sheet-order-api

# 安裝依賴
npm install

# 本地開發 Workers API
npm run dev
# 或
wrangler dev

# 部署到 Cloudflare Workers
npm run deploy
# 或 
wrangler deploy

# 生成型別定義
npm run cf-typegen
# 或
wrangler types
```

### 傳統 PHP API (向後兼容)
```powershell
# 清理伺服器快取 (Windows)
./clear-cache.bat

# 檢查 API 快取狀態
# 存取 /api/check_cache.php
```

## 核心架構

### 部署架構
- **前端**: Cloudflare Pages 部署 (靜態網站)
- **API**: Cloudflare Workers 部署 (`sheet-order-api.ruby7677.workers.dev`)
- **資料來源**: Google Sheets API v4
- **快取**: Cloudflare KV Storage + 記憶體快取
- **CDN**: Cloudflare 全球網路

### 前端技術棧
- **框架**: React 18.3.1 + TypeScript 5.5.3
- **建置工具**: Vite 5.4.1 + SWC (快速編譯)
- **樣式**: Tailwind CSS 3.4.11 + shadcn/ui 組件庫
- **狀態管理**: TanStack Query 5.56.2 (React Query)
- **路由**: React Router DOM 6.26.2
- **表單**: React Hook Form + Zod 驗證
- **圖標**: Lucide React
- **圖表**: Recharts
- **通知**: Sonner (Toast)

### Cloudflare Workers API
- **框架**: Hono + Chanfana (OpenAPI 支援)
- **語言**: TypeScript
- **部署**: Cloudflare Workers
- **API 文件**: 自動生成的 OpenAPI 文件
- **快取**: Cloudflare KV Storage
- **環境**: 生產環境 (`sheet-order-api`) / 開發環境 (`sheet-order-api-dev`)

### 關鍵檔案結構
```
# 前端 (Cloudflare Pages)
src/
├── components/          # React 組件
│   ├── ui/             # shadcn/ui 基礎組件
│   ├── OrderList.tsx   # 訂單列表 (632行核心組件)
│   ├── OrderItemEditor.tsx # 商品編輯器 ⚠️包含硬編碼商品
│   ├── Dashboard.tsx   # 主控台 ⚠️包含硬編碼統計
│   └── ...
├── services/           # API 服務層
│   ├── orderService.ts # 訂單服務 ⚠️包含硬編碼商品邏輯
│   └── customerService.ts # 客戶服務
├── types/              # TypeScript 類型
│   ├── order.ts        # 訂單類型 ⚠️包含硬編碼商品類型
│   ├── env.d.ts        # 環境變數型別定義
│   └── ...

# Cloudflare Workers API
sheet-order-api/
├── src/
│   ├── index.ts        # Hono 應用程式入口
│   ├── types.ts        # API 型別定義
│   └── endpoints/      # API 端點
│       ├── taskCreate.ts
│       ├── taskDelete.ts
│       ├── taskFetch.ts
│       └── taskList.ts
├── wrangler.jsonc      # Cloudflare Workers 設定
└── package.json

# 傳統 PHP API (向後兼容)
api/                    # 舊版 PHP API 端點
workers-example/        # Workers 範例與設定
```

## 重要注意事項

### 部署架構變更
✅ **已升級為現代化 Cloudflare 架構**:
- **前端**: Cloudflare Pages 自動部署
- **API**: Cloudflare Workers (`https://sheet-order-api.ruby7677.workers.dev`)
- **快取**: Cloudflare KV Storage 取代檔案快取
- **CDN**: 全球邊緣節點加速

### API 端點配置
**生產環境**: `https://sheet-order-api.ruby7677.workers.dev`
- 所有前端 API 呼叫指向 Workers API
- 自動 HTTPS 與全球分佈
- KV Storage 快取機制

**API 端點 (在 orderService.ts)**:
- 取得訂單: `/api/get_orders_from_sheet.php`
- 更新訂單狀態: `/api/update_order_status.php`
- 更新付款狀態: `/api/update_payment_status.php`
- 更新商品: `/api/update_order_items.php`
- 刪除訂單: `/api/delete_order.php`
- 批量刪除: `/api/batch_delete_orders.php`

### 商品硬編碼問題
⚠️ **系統目前採用硬編碼方式管理商品資訊**，商品資料分散在以下檔案中：
- `src/components/OrderItemEditor.tsx` (第25-28行)
- `src/services/orderService.ts` (第149-152行、第362-368行)
- `src/components/Dashboard.tsx` (第111-123行)
- `src/types/order.ts` (第38-41行)

**商品列表**:
- 原味蘿蔔糕: NT$250
- 芋頭粿: NT$350
- 台式鹹蘿蔔糕: NT$350
- 鳳梨豆腐乳: NT$300

### Google Sheets 整合
- **試算表 ID**: `10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo`
- **工作表**: Sheet1 (訂單)、客戶名單 (客戶資料)
- **認證**: Google Service Account (透過 Cloudflare Workers Secrets)

### 環境變數設定

**前端環境變數 (env.d.ts)**:
- `VITE_APP_ENV` - 應用程式環境
- `VITE_API_BASE_URL` - API 基礎路徑
- `VITE_API_HOST` - API 主機
- `VITE_GOOGLE_SHEET_ID` - Google Sheets ID
- `VITE_CF_PAGES_URL` - Cloudflare Pages URL
- `VITE_CACHE_DURATION` - 快取持續時間
- `VITE_DEBUG_MODE` - 除錯模式

**Workers 環境變數 (wrangler.toml)**:
- `GOOGLE_SHEET_ID` - Google Sheets ID
- `APP_ENV` - 環境 (production/development)
- `CACHE_DURATION` - 快取時間 (生產: 15000ms, 開發: 5000ms)
- `DEBUG_MODE` - 除錯模式
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Google API 認證 (Secret)

### Cloudflare KV Storage
**生產環境**:
- KV Namespace ID: `37c85c7f1aa84365810dc5ddb4015d47`
- Binding: `CACHE_KV`

**開發環境**:
- KV Namespace ID: `9e131cdce1674b5e946c19ece9efef0c`
- Binding: `CACHE_KV`

### 狀態管理
**訂單狀態**:
- 訂單確認中 (初始)
- 已抄單
- 已出貨
- 取消訂單

**付款狀態**:
- 未收費
- 已收費
- 待轉帳
- 未全款
- 特殊

### 開發環境設定

**本地開發代理設定**:
- 開發伺服器: `0.0.0.0:8080`
- API 代理 (僅開發): `/api` → `/sheet-order-dashboard-main/api`
- 允許的主機: `node.767780.xyz`, `lopokao.767780.xyz`, `localhost`

**TypeScript 設定**:
- 路徑別名: `@/*` → `./src/*`
- 寬鬆設定: 允許 any 類型、未使用參數
- 跳過庫檢查以提升建置速度

## 部署流程

### 前端部署 (Cloudflare Pages)
1. **建置**: `npm run build`
2. **部署**: Git push 到連結的 repository 自動觸發部署
3. **輸出**: `dist/` 目錄自動部署到 Cloudflare Pages
4. **域名**: Cloudflare Pages 提供的域名或自訂域名

### API 部署 (Cloudflare Workers)
1. **進入目錄**: `cd sheet-order-api`
2. **安裝依賴**: `npm install`
3. **設定 Secrets**: `wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY`
4. **部署**: `wrangler deploy`
5. **域名**: `https://sheet-order-api.ruby7677.workers.dev`

### Secrets 管理
```powershell
# 設定 Google Service Account Key
wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY
# 將 service-account-key2.json 的完整內容複製貼上
```

## 除錯與監控

### API 除錯工具
- **Workers 日誌**: Cloudflare Dashboard → Workers → Logs
- **Real-time Logs**: `wrangler tail`
- **舊版 PHP API**: `api/check_api_path.php`, `api/test_api_access.php`

### 效能優化
- **CDN**: Cloudflare 全球邊緣快取
- **KV Storage**: 分散式快取替代檔案快取
- **Workers**: 全球部署，低延遲
- **Pages**: 靜態檔案最佳化與壓縮

### 安全性
- **HTTPS**: 強制使用，自動憑證
- **Workers Security**: 內建 DDoS 防護
- **Secrets**: 加密存儲敏感資訊
- **CORS**: 嚴格跨域設定