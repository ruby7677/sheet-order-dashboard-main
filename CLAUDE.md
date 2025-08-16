# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是一個蘿蔔糕訂購系統的後台管理 Dashboard，具備訂單管理、客戶管理、統計分析等功能。系統採用前後端分離架構，前端使用 React + TypeScript + Tailwind CSS，後端包含 PHP API（傳統）和 Cloudflare Workers API（現代化）兩套方案，並整合 Supabase 作為新的資料存儲解決方案。

## 架構設計

### 前端架構
- **技術棧**: React 18 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui
- **狀態管理**: TanStack Query 用於服務器狀態管理，React Context 用於認證狀態
- **路由**: React Router v6
- **UI 組件**: shadcn/ui 組件庫，完整的 Radix UI 系統
- **圖表**: Recharts 用於數據可視化

### 後端架構
- **傳統 API**: PHP API (`api/` 目錄) - Google Sheets 整合
- **現代 API**: Cloudflare Workers (`sheet-order-api/` 目錄) - 使用 Hono 框架
- **新資料層**: Supabase 整合 (`src/integrations/supabase/`)

### 數據流
1. **Google Sheets**: 原始訂單數據來源
2. **Supabase**: 現代化資料庫存儲
3. **Cloudflare KV**: Workers API 的快取層
4. **前端快取**: 使用 TanStack Query 管理

## 常用指令

### 開發環境
```bash
# 啟動前端開發服務器 (端口 8080)
npm run dev

# 啟動前端開發服務器 (除錯模式)
npm run dev:debug

# 清除快取並啟動
npm run dev:clean
```

### 建置和部署
```bash
# 生產環境建置
npm run build

# 開發環境建置
npm run build:dev

# 預覽建置結果
npm run preview

# 清除 node_modules 快取和 dist
npm run clean
```

### 程式碼品質
```bash
# ESLint 檢查
npm run lint
```

### Cloudflare Workers API
```bash
# 進入 Workers 目錄
cd sheet-order-api

# 本地開發 Workers (端口 5714)
npm run dev

# 部署到 Cloudflare
npm run deploy

# 生成 TypeScript 類型
npm run cf-typegen
```

### Supabase 開發
```bash
# 啟動本地 Supabase (如果有設定)
supabase start

# 推送資料庫 migration
supabase db push

# 生成 TypeScript 類型
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

## 環境配置

### 開發端口
- 前端開發服務器: `8080` (已配置在 vite.config.ts)
- Cloudflare Workers 本地: `5714` (推薦用於測試)
- 測試替代端口: `8082` 或 `5714`

### API 端點策略
系統使用動態 API 配置 (`src/services/orderService.ts:5-38`)：
1. **生產環境**: 使用 Cloudflare Workers API (`https://sheet-order-api.ruby7677.workers.dev`)
2. **本地開發**: 嘗試本地 Workers API (`http://127.0.0.1:5714`)，失敗則降級到傳統 PHP API
3. **Cloudflare Pages**: 使用生產 Workers API

## 重要檔案結構

### 前端核心
- `src/App.tsx` - 主應用入口，路由配置
- `src/pages/Index.tsx` - 主頁面，目前有未提交的修改
- `src/components/Dashboard.tsx` - 核心統計面板
- `src/services/orderService.ts` - 訂單服務，包含動態 API 配置邏輯
- `src/integrations/supabase/` - Supabase 整合

### 後端 API
- `api/` - 傳統 PHP API 檔案
- `sheet-order-api/src/` - Cloudflare Workers API
- `sheet-order-api/wrangler.jsonc` - Workers 部署配置

### 配置檔案
- `vite.config.ts` - Vite 配置，包含開發代理設定
- `components.json` - shadcn/ui 組件配置
- `tailwind.config.ts.bak` - Tailwind CSS 配置備份

## 開發注意事項

### 程式碼風格
- 檔案大小限制: 單檔嚴格控制在 500 行以內
- TypeScript 嚴格模式啟用
- ESLint 規則已配置，@typescript-eslint/no-unused-vars 已關閉

### API 開發
- 優先使用 Cloudflare Workers API 進行新功能開發
- 傳統 PHP API 作為後備方案維護
- 所有 API 調用都透過 `orderService.ts` 統一管理

### Supabase 整合
- 新功能應優先考慮使用 Supabase 作為資料來源
- 現有 Google Sheets 整合保持向後兼容
- 使用 `src/integrations/supabase/client.ts` 進行資料庫操作

### 環境變數管理
- Vite 環境變數前綴: `VITE_`
- Workers 環境變數在 `wrangler.jsonc` 中配置
- Supabase 配置透過 `src/integrations/supabase/client.ts`

### 快取策略
- 前端: TanStack Query 提供智能快取
- Workers: Cloudflare KV 作為快取層 (15 秒過期)
- 開發時可透過 `clearOrderCache()` 清除快取

### 跨域和代理
- 開發環境配置了詳細的 CORS 和代理設定
- Proxy 配置支援 URI 解碼錯誤處理
- 允許的主機包含本地和生產域名