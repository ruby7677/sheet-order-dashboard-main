# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

這是一個蘿蔔糕訂購系統的管理後台，使用 React 18 + TypeScript + Vite 構建，透過 PHP API 與 Google Sheets 整合進行訂單管理。

## 核心開發指令

### 開發環境
```bash
# 啟動開發伺服器 (http://localhost:8080)
npm run dev

# 開發模式帶除錯資訊
npm run dev:debug

# 清除快取後啟動開發環境
npm run dev:clean
```

### 建置與部署
```bash
# 生產環境建置
npm run build

# 開發環境建置 (含 source map)
npm run build:dev

# 預覽建置結果
npm run preview
```

### 程式碼品質
```bash
# ESLint 檢查
npm run lint

# 清除建置快取
npm run clean
```

### 後端快取管理
```bash
# 清除伺服器快取
clear-cache.bat

# 檢查 API 狀態
curl http://localhost/sheet-order-dashboard-main/api/check_api_path.php

# 檢查快取狀態
curl http://localhost/sheet-order-dashboard-main/api/check_cache.php
```

## 核心架構概覽

### API 代理配置
- **開發環境**: `localhost:8080/api/*` → `localhost/sheet-order-dashboard-main/api/*`
- **生產環境**: 直接存取 `/api/*` 路徑
- **智能路徑偵測**: `orderService.ts` 會自動偵測環境並使用正確的 API 基礎路徑

### Google Sheets 整合
- **試算表 ID**: `10MMALrfBonchPGjb-ps6Knw7MV6lllrrKRCTeafCIuo`
- **認證檔案**: `service-account-key2.json`
- **主要工作表**: 
  - `Sheet1`: 訂單資料 (15個欄位)
  - `客戶名單`: 客戶基本資料

### 三層快取機制
1. **瀏覽器快取**: 透過 no-cache headers 停用
2. **伺服器快取**: 15秒 JSON 檔案快取 (`cache/` 目錄)
3. **客戶端記憶體快取**: Service 層 15秒快取

## 關鍵架構模式

### 服務層架構
- **`orderService.ts` (842行)**: 核心訂單業務邏輯
  - 智能 API 路徑偵測
  - 批量操作支援
  - 重複訂單檢測
  - CSV/Excel 匯出功能
- **`customerService.ts` (329行)**: 客戶資料聚合與分析

### 組件架構重點
- **`OrderList.tsx` (632行)**: 主要訂單管理介面
- **`OrderItemEditor.tsx`**: 商品編輯器，包含硬編碼商品資訊
- **`Dashboard.tsx`**: 統計面板，包含硬編碼商品統計邏輯
- **批量操作組件**: `BatchDeleteConfirmDialog.tsx`, `DuplicateOrdersDialog.tsx`

### 商品硬編碼系統 (重要架構決策)
目前商品資訊採用硬編碼方式分散在以下檔案中：
- `src/components/OrderItemEditor.tsx` (第25-28行) - 商品選項與定價
- `src/services/orderService.ts` (第149-152行, 362-368行) - 價格對應與統計邏輯
- `src/components/Dashboard.tsx` (第111-123行) - 商品統計計算
- `src/types/order.ts` (第38-41行) - 商品類型定義

**商品定價**:
- 原味蘿蔔糕: NT$250
- 芋頭粿: NT$350  
- 台式鹹蘿蔔糕: NT$350
- 鳳梨豆腐乳: NT$300

## 開發時重要注意事項

### 商品相關修改
當需要修改商品資訊時，必須同時更新上述四個檔案以保持一致性。建議未來重構為動態商品管理系統。

### API 路徑除錯
如遇到 API 連接問題：
1. 檢查 `vite.config.ts` 中的 proxy 設定
2. 使用 `api/check_api_path.php` 診斷路徑問題
3. 確認 Vite 開發伺服器正確代理到 Apache/PHP

### 快取問題處理
API 資料不更新時的除錯順序：
1. 前端: 在 API 請求加上 `refresh=1` 參數
2. 伺服器: 執行 `clear-cache.bat` 清除快取檔案
3. Cloudflare: 清除 CDN 快取 (生產環境)

### 錯誤處理機制
- **URI 錯誤**: `uriErrorHandler.ts` 處理 URI malformed 錯誤
- **網路錯誤**: Service 層統一錯誤處理與用戶提示
- **全域錯誤**: `index.html` 中設定 window.onerror 處理

### 批量操作安全機制
所有批量操作都包含：
- 操作前確認對話框
- 時間戳 + 隨機數防重放攻擊
- 操作結果詳細回報
- 自動快取清除

## 部署相關配置

### Apache 設定需求
需要 `.htaccess` 支援 SPA 路由，確保前端路由正常運作。

### PHP 環境需求
- PHP 7.4+ (建議 8.0+)
- 必要擴展: curl, json, openssl, mbstring
- `cache/` 目錄需要寫入權限 (755)

### Cloudflare 配置
- API 路徑必須設定為「繞過快取」
- 設定 CORS 與安全標頭
- 定期清除 API 相關快取

## 特殊功能說明

### iframe 嵌入支援
系統支援 iframe 嵌入，可透過 postMessage 與父視窗通訊進行模式切換。

### 雙模式介面
- **Orders Mode**: 完整訂單管理
- **Customers Mode**: 客戶關係管理
- 透過側邊欄或 iframe 訊息切換模式

### 進階篩選與搜尋
支援多維度篩選：訂單狀態、付款狀態、配送方式、日期範圍、客戶電話/姓名搜尋。

### CSV/Excel 匯出
提供多種匯出格式，包含台灣物流業者相容的 CSV 格式。