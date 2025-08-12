# 開發指南

本文檔提供了蘿蔔糕訂購系統的開發指南，包括環境設置、開發流程、測試和部署。

## 目錄

1. [環境設置](#環境設置)
2. [開發流程](#開發流程)
3. [代碼風格](#代碼風格)
4. [測試](#測試)
5. [調試技巧](#調試技巧)
6. [部署](#部署)
7. [版本控制](#版本控制)

## 環境設置

### 前端開發環境

1. **安裝 Node.js**
   - 下載並安裝 Node.js 18.x 或更高版本
   - 網址：https://nodejs.org/

2. **安裝依賴**
   ```bash
   cd sheet-order-dashboard-main
   npm install
   ```

3. **啟動開發伺服器**
   ```bash
   npm run dev
   ```
   開發伺服器將在 http://localhost:8080 啟動

### 後端開發環境

1. **安裝 XAMPP**
   - 下載並安裝 XAMPP 8.0 或更高版本
   - 網址：https://www.apachefriends.org/

2. **配置 Apache**
   - 確保 Apache 監聽 80 端口
   - 將專案放在 `D:/xampp/htdocs/sheet-order-dashboard-main` 目錄下

3. **安裝 PHP 依賴**
   ```bash
   composer require google/apiclient:^2.0
   ```

4. **配置 Google API 憑證**
   - 將 `service-account-key2.json` 放在專案根目錄下

## 開發流程

### 前端開發

1. **組件開發**
   - 在 `src/components` 目錄下創建新組件
   - 使用 TypeScript 和 React Hooks
   - 遵循組件命名規範

2. **樣式開發**
   - 使用 Tailwind CSS 進行樣式設計
   - 自定義樣式在 `src/styles` 目錄下

3. **API 集成**
   - 在 `src/services` 目錄下添加 API 服務
   - 使用 fetch API 進行 HTTP 請求
   - 添加適當的錯誤處理

### 後端開發

1. **API 開發**
   - 在 `api` 目錄下創建新的 API 端點
   - 引入 `common_headers.php` 設置標頭
   - 遵循 API 響應格式規範

2. **Google Sheets 集成**
   - 使用 Google Sheets API 讀取和寫入數據
   - 處理認證和授權
   - 實現適當的錯誤處理

3. **快取管理**
   - 實現伺服器端快取機制
   - 在數據更新時清除快取
   - 提供強制刷新選項

## 代碼風格

### 前端代碼風格

1. **TypeScript 規範**
   - 使用 TypeScript 類型定義
   - 避免使用 `any` 類型
   - 為函數和組件添加類型註解

2. **React 最佳實踐**
   - 使用函數組件和 Hooks
   - 避免不必要的渲染
   - 適當拆分組件

3. **命名規範**
   - 組件使用 PascalCase
   - 函數和變量使用 camelCase
   - 常量使用大寫加下劃線

### 後端代碼風格

1. **PHP 規範**
   - 遵循 PSR-12 代碼風格
   - 使用適當的註釋
   - 實現錯誤處理

2. **API 設計**
   - 遵循 RESTful API 設計原則
   - 使用統一的響應格式
   - 提供詳細的錯誤信息

## 測試

### 前端測試

1. **單元測試**
   - 使用 Jest 進行單元測試
   - 測試關鍵函數和組件
   - 運行測試：`npm test`

2. **集成測試**
   - 測試組件之間的交互
   - 測試 API 集成
   - 運行集成測試：`npm run test:integration`

### 後端測試

1. **API 測試**
   - 使用 Postman 或 curl 測試 API 端點
   - 驗證響應格式和狀態碼
   - 測試錯誤處理

2. **快取測試**
   - 測試快取機制是否正常工作
   - 測試快取清除功能
   - 測試強制刷新選項

## 調試技巧

### 前端調試

1. **使用 React DevTools**
   - 安裝 React DevTools 瀏覽器擴展
   - 檢查組件層次結構和狀態
   - 監控渲染性能

2. **使用 Network 面板**
   - 監控 API 請求和響應
   - 檢查請求標頭和響應標頭
   - 驗證快取控制標頭

3. **使用 Console**
   - 添加 `console.log` 語句進行調試
   - 使用 `console.time` 和 `console.timeEnd` 測量性能
   - 使用 `console.table` 顯示表格數據

### 後端調試

1. **啟用 PHP 錯誤顯示**
   ```php
   ini_set('display_errors', 1);
   ini_set('display_startup_errors', 1);
   error_reporting(E_ALL);
   ```

2. **使用日誌**
   ```php
   error_log('Debug message', 0);
   ```

3. **使用 API 診斷工具**
   - 訪問 `/api/check_api_path.php`
   - 檢查環境配置和 API 路徑
   - 驗證快取目錄和文件

## 部署

### 前端部署

1. **構建生產版本**
   ```bash
   npm run build
   ```
   構建結果將在 `dist` 目錄下

2. **部署到伺服器**
   - 將 `dist` 目錄的內容上傳到伺服器
   - 確保 `.htaccess` 文件正確配置

### 後端部署

1. **上傳 API 文件**
   - 將 `api` 目錄上傳到伺服器
   - 確保文件權限正確

2. **配置伺服器**
   - 確保 PHP 版本兼容
   - 配置 Apache 或 Nginx
   - 設置適當的 CORS 標頭

3. **設置快取目錄**
   - 創建 `cache` 目錄
   - 確保目錄可寫入
   - 設置適當的權限

## 版本控制

### Git 工作流

1. **分支策略**
   - `main`: 生產環境分支
   - `develop`: 開發環境分支
   - `feature/*`: 功能分支
   - `bugfix/*`: 錯誤修復分支

2. **提交規範**
   - 使用描述性的提交信息
   - 遵循 Conventional Commits 規範
   - 示例：`feat: 添加訂單篩選功能`

3. **代碼審查**
   - 所有代碼變更都需要通過代碼審查
   - 使用拉取請求進行代碼審查
   - 確保代碼符合項目規範
