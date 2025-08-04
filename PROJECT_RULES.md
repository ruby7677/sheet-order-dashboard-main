# 蘿蔔糕訂購系統專案規則

## 目錄
1. [專案結構](#專案結構)
2. [開發規範](#開發規範)
3. [API 規範](#api-規範)
4. [快取機制](#快取機制)
5. [Cloudflare 配置](#cloudflare-配置)
6. [部署流程](#部署流程)
7. [錯誤處理](#錯誤處理)
8. [安全性規範](#安全性規範)

## 專案結構

### 目錄結構
```
sheet-order-dashboard-main/
├── api/                  # 後端 API 文件
│   ├── common_headers.php  # 共用標頭設置
│   ├── get_orders_from_sheet.php  # 獲取訂單數據
│   ├── update_order_status.php    # 更新訂單狀態
│   ├── update_payment_status.php  # 更新付款狀態
│   ├── delete_order.php           # 刪除訂單
│   └── check_api_path.php         # API 路徑診斷工具
├── cache/                # 快取目錄
├── public/               # 靜態資源
├── src/                  # 前端源代碼
│   ├── components/       # React 組件
│   ├── hooks/            # 自定義 Hooks
│   ├── lib/              # 工具函數
│   ├── pages/            # 頁面組件
│   ├── services/         # API 服務
│   └── types/            # TypeScript 類型定義
├── .htaccess             # Apache 配置文件
├── index.html            # 入口 HTML 文件
├── vite.config.ts        # Vite 配置
└── service-account-key2.json  # Google API 憑證
```

## 開發規範

### 前端開發規範

1. **組件命名**
   - 使用 PascalCase 命名組件文件和組件名稱
   - 例如：`OrderList.tsx`, `OrderDetail.tsx`

2. **狀態管理**
   - 使用 React Hooks 管理組件狀態
   - 複雜狀態考慮使用 Context API 或 Redux

3. **樣式規範**
   - 使用 Tailwind CSS 進行樣式設計
   - 自定義樣式使用 CSS Modules 或 styled-components

4. **TypeScript 規範**
   - 所有組件和函數都應該有明確的類型定義
   - 避免使用 `any` 類型
   - 使用 interface 定義數據結構

5. **代碼格式**
   - 使用 ESLint 和 Prettier 保持代碼風格一致
   - 縮進使用 2 個空格
   - 使用分號結束語句

### 後端開發規範

1. **PHP 代碼規範**
   - 使用 PSR-12 代碼風格
   - 類名使用 PascalCase
   - 函數和變量名使用 camelCase
   - 常量使用大寫加下劃線

2. **文件命名**
   - 使用小寫字母和下劃線命名 PHP 文件
   - 例如：`get_orders_from_sheet.php`, `update_order_status.php`

3. **錯誤處理**
   - 使用 try-catch 捕獲異常
   - 返回統一格式的錯誤信息

4. **安全性**
   - 驗證所有用戶輸入
   - 使用參數化查詢防止 SQL 注入
   - 設置適當的 CORS 標頭

## API 規範

### 請求格式

1. **GET 請求**
   - 用於獲取數據
   - 添加時間戳和隨機參數防止快取
   - 例如：`/api/get_orders_from_sheet.php?refresh=1&_=1623456789&nonce=abc123`

2. **POST 請求**
   - 用於創建或更新數據
   - 使用 JSON 格式傳遞數據
   - 添加時間戳和隨機參數防止快取
   - 例如：
     ```json
     {
       "id": "123",
       "status": "已出貨",
       "timestamp": 1623456789,
       "nonce": "abc123"
     }
     ```

### 響應格式

1. **成功響應**
   ```json
   {
     "success": true,
     "data": [...],
     "timestamp": 1623456789,
     "request_id": "abc123def456"
   }
   ```

2. **錯誤響應**
   ```json
   {
     "success": false,
     "message": "錯誤信息",
     "timestamp": 1623456789,
     "request_id": "abc123def456"
   }
   ```

### API 端點

| 端點 | 方法 | 描述 | 參數 |
|------|------|------|------|
| `/api/get_orders_from_sheet.php` | GET | 獲取訂單列表 | `refresh=1&_={timestamp}&nonce={random}` |
| `/api/update_order_status.php` | POST | 更新訂單狀態 | `id`, `status`, `timestamp`, `nonce` |
| `/api/update_payment_status.php` | POST | 更新付款狀態 | `id`, `paymentStatus`, `timestamp`, `nonce` |
| `/api/delete_order.php` | POST | 刪除訂單 | `id`, `timestamp`, `nonce` |
| `/api/check_api_path.php` | GET | 檢查 API 路徑 | 無 |

## 快取機制

### 伺服器端快取

1. **快取目錄**
   - 位置：`sheet-order-dashboard-main/cache/`
   - 確保目錄存在且可寫入

2. **快取文件**
   - 訂單數據快取：`orders_cache.json`
   - 快取有效期：15 秒

3. **快取更新**
   - 當訂單狀態更新時，刪除快取文件
   - 當付款狀態更新時，刪除快取文件
   - 當訂單刪除時，刪除快取文件

### 客戶端快取

1. **內存快取**
   - 位置：`orderService.ts` 中的 `orderCache` 變量
   - 快取有效期：15 秒

2. **快取更新**
   - 調用 `clearOrderCache()` 函數清除快取
   - 在訂單狀態更新、付款狀態更新、訂單刪除後清除快取

3. **強制刷新**
   - 添加 `refresh=1` 參數強制繞過快取
   - 添加時間戳和隨機數確保請求唯一性

## Cloudflare 配置

### 頁面規則

1. **API 路徑規則**
   - URL 模式：`*yourdomain.com/api/*`
   - 快取級別：繞過
   - 瀏覽器快取 TTL：0 秒
   - 邊緣快取 TTL：0 秒

2. **開發工具路徑規則**
   - URL 模式：`*yourdomain.com/sheet-order-dashboard-main/api/*`
   - 快取級別：繞過
   - 瀏覽器快取 TTL：0 秒
   - 邊緣快取 TTL：0 秒

### 快取清除

定期清除以下路徑的快取：
- `*yourdomain.com/api/*`
- `*yourdomain.com/sheet-order-dashboard-main/api/*`

### 開發者模式

在開發和測試期間，可以暫時啟用開發者模式，完全繞過 Cloudflare 的快取。

## 部署流程

1. **本地開發**
   - 使用 `npm run dev` 啟動開發伺服器
   - 訪問 `http://localhost:8080`

2. **測試部署**
   - 將代碼推送到測試環境
   - 確保 API 路徑正確配置
   - 測試所有功能

3. **生產部署**
   - 將代碼推送到生產環境
   - 清除 Cloudflare 快取
   - 驗證所有功能正常工作

## 錯誤處理

1. **前端錯誤處理**
   - 使用 try-catch 捕獲 API 請求錯誤
   - 使用 toast 通知顯示錯誤信息
   - 在控制台記錄詳細錯誤信息

2. **後端錯誤處理**
   - 使用 try-catch 捕獲異常
   - 返回統一格式的錯誤信息
   - 記錄錯誤到日誌文件

3. **錯誤報告**
   - 收集前端錯誤信息
   - 定期檢查後端錯誤日誌
   - 根據錯誤信息改進代碼

## 安全性規範

1. **API 安全**
   - 驗證所有用戶輸入
   - 限制 API 請求頻率
   - 設置適當的 CORS 標頭

2. **數據安全**
   - 保護 Google API 憑證
   - 不在客戶端存儲敏感信息
   - 定期更新依賴庫

3. **訪問控制**
   - 實施用戶認證和授權
   - 限制管理功能的訪問
   - 記錄重要操作的審計日誌
