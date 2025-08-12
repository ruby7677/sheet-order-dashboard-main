# API 文檔

本文檔詳細說明了蘿蔔糕訂購系統後台的 API 端點、請求格式和響應格式。

## 目錄

1. [通用規範](#通用規範)
2. [獲取訂單](#獲取訂單)
3. [更新訂單狀態](#更新訂單狀態)
4. [更新付款狀態](#更新付款狀態)
5. [刪除訂單](#刪除訂單)
6. [API 診斷工具](#api-診斷工具)
7. [錯誤處理](#錯誤處理)
8. [快取機制](#快取機制)

## 通用規範

### 基礎 URL

- 本地開發環境：`/sheet-order-dashboard-main/api`
- 生產環境：`/api`

### 請求標頭

所有 API 請求應包含以下標頭：

```
Content-Type: application/json
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

### 響應格式

所有 API 響應都使用 JSON 格式，並包含以下字段：

- 成功響應：
```json
{
  "success": true,
  "data": [...],  // 可選，根據端點不同而變化
  "timestamp": 1623456789,
  "request_id": "abc123def456",
  "message": "操作成功"  // 可選
}
```

- 錯誤響應：
```json
{
  "success": false,
  "message": "錯誤信息",
  "timestamp": 1623456789,
  "request_id": "abc123def456"
}
```

### 防止快取的參數

為防止 Cloudflare 和瀏覽器快取，所有請求都應添加以下參數：

- `_`: 當前時間戳（毫秒）
- `nonce`: 隨機字符串
- `refresh`: 設置為 1 表示強制刷新

## 獲取訂單

獲取所有訂單數據。

### 請求

- **URL**: `/api/get_orders_from_sheet.php`
- **方法**: GET
- **參數**:
  - `refresh`: 1（強制刷新）
  - `_`: 時間戳
  - `nonce`: 隨機字符串
  - `v`: API 版本（可選）

### 示例

```
GET /api/get_orders_from_sheet.php?refresh=1&_=1623456789&nonce=abc123&v=1.1
```

### 響應

```json
{
  "success": true,
  "data": [
    {
      "createdAt": "2023-06-01",
      "id": "1",
      "orderNumber": "ORD-1623456789-1",
      "customer": {
        "name": "張三",
        "phone": "0912345678"
      },
      "items": [
        {
          "product": "原味蘿蔔糕",
          "quantity": 2,
          "price": 250,
          "subtotal": 500
        }
      ],
      "total": 500,
      "dueDate": "2023-06-10",
      "deliveryTime": "上午",
      "notes": "不要辣",
      "status": "訂單確認中",
      "deliveryMethod": "宅配",
      "deliveryAddress": "台北市信義區101號",
      "paymentMethod": "貨到付款",
      "paymentStatus": "未付款"
    }
  ],
  "timestamp": 1623456789,
  "request_id": "abc123def456"
}
```

## 更新訂單狀態

更新指定訂單的狀態。

### 請求

- **URL**: `/api/update_order_status.php`
- **方法**: POST
- **參數**:
  - `_`: 時間戳（URL 參數）
  - `nonce`: 隨機字符串（URL 參數）
- **請求體**:
```json
{
  "id": "1",
  "status": "已出貨",
  "timestamp": 1623456789,
  "nonce": "abc123"
}
```

### 狀態值

有效的狀態值包括：
- `訂單確認中`
- `已抄單`
- `已出貨`
- `取消訂單`

### 響應

```json
{
  "success": true,
  "timestamp": 1623456789,
  "request_id": "abc123def456",
  "message": "訂單狀態已成功更新"
}
```

## 更新付款狀態

更新指定訂單的付款狀態。

### 請求

- **URL**: `/api/update_payment_status.php`
- **方法**: POST
- **參數**:
  - `_`: 時間戳（URL 參數）
  - `nonce`: 隨機字符串（URL 參數）
- **請求體**:
```json
{
  "id": "1",
  "paymentStatus": "已付款",
  "timestamp": 1623456789,
  "nonce": "abc123"
}
```

### 響應

```json
{
  "success": true,
  "timestamp": 1623456789,
  "request_id": "abc123def456",
  "message": "付款狀態已成功更新"
}
```

## 刪除訂單

**⚠️ 重要提醒：此操作會從 Google Sheets 中永久刪除指定的訂單行，無法復原！**

刪除指定的訂單（真正刪除該行，而非僅清空內容）。

### 請求

- **URL**: `/api/delete_order.php`
- **方法**: POST
- **參數**:
  - `_`: 時間戳（URL 參數）
  - `nonce`: 隨機字符串（URL 參數）
- **請求體**:
```json
{
  "id": "1",
  "timestamp": 1623456789,
  "nonce": "abc123"
}
```

### 功能說明

1. **真正刪除行**：使用 Google Sheets API 的 `batchUpdate` 方法中的 `deleteDimension` 操作
2. **行號重新排列**：刪除後，後續行的行號會自動向上移動
3. **ID重排序**：自動重新排序後續訂單的ID，確保ID的連續性
4. **快取清除**：自動清除伺服器端快取文件，確保數據一致性
5. **前端確認**：前端會顯示確認對話框，提醒用戶此操作不可復原

### 響應

成功響應：
```json
{
  "success": true,
  "timestamp": 1623456789,
  "request_id": "abc123def456",
  "message": "訂單已成功從 Google Sheets 中刪除，ID已重新排序",
  "deleted_row": 2,
  "reorder_result": {
    "success": true,
    "message": "成功重新排序 3 個訂單的ID",
    "updated_rows": 3,
    "start_index": 2,
    "total_rows": 5
  }
}
```

錯誤響應：
```json
{
  "success": false,
  "message": "指定的訂單不存在"
}
```

### 注意事項

- **ID重排序**：刪除後會自動重新排序後續訂單的ID，確保ID連續性
- **Google Sheets更新**：同時更新Google Sheets中的N欄（ID欄位）
- **快取同步**：刪除和重排序後會自動清除快取，確保數據一致性
- **備份建議**：建議在刪除前先備份重要數據
- **前端更新**：刪除後會自動重新載入訂單列表以反映最新狀態

## API 診斷工具

檢查 API 路徑和環境配置。

### 請求

- **URL**: `/api/check_api_path.php`
- **方法**: GET

### 響應

```json
{
  "success": true,
  "message": "成功檢查 API 路徑",
  "environment": {
    "server_software": "Apache/2.4.54 (Win64) OpenSSL/1.1.1q PHP/8.1.10",
    "document_root": "D:/xampp/htdocs",
    "script_filename": "D:/xampp/htdocs/sheet-order-dashboard-main/api/check_api_path.php",
    "request_uri": "/api/check_api_path.php",
    "http_host": "localhost:8080",
    "server_protocol": "HTTP/1.1",
    "php_version": "8.1.10",
    "os": "WINNT"
  },
  "api_paths": {
    "current_file": "D:/xampp/htdocs/sheet-order-dashboard-main/api/check_api_path.php",
    "current_dir": "D:/xampp/htdocs/sheet-order-dashboard-main/api",
    "parent_dir": "D:/xampp/htdocs/sheet-order-dashboard-main",
    "api_files": {
      "get_orders_from_sheet.php": {
        "exists": true,
        "path": "D:/xampp/htdocs/sheet-order-dashboard-main/api/get_orders_from_sheet.php",
        "size": 3245,
        "last_modified": "2023-06-01 12:34:56"
      }
    }
  },
  "cache": {
    "cache_dir_exists": true,
    "cache_dir_writable": true,
    "cache_file_exists": true
  }
}
```

## 錯誤處理

### 常見錯誤代碼

| 錯誤信息 | 描述 |
|---------|------|
| `缺少參數` | 請求缺少必要的參數 |
| `狀態值不正確` | 提供的訂單狀態不在允許的值列表中 |
| `找不到指定訂單` | 指定的訂單 ID 不存在 |
| `找不到 id 或 status 欄位` | Google Sheet 中缺少必要的列 |

### 處理錯誤

前端應該處理所有可能的錯誤，並向用戶顯示適當的錯誤信息。例如：

```typescript
try {
  await updateOrderStatus(id, status);
} catch (error) {
  console.error('更新訂單狀態失敗:', error);
  toast({
    title: '錯誤',
    description: error.message || '更新訂單狀態失敗',
    variant: 'destructive',
  });
}
```

## 快取機制

### 伺服器端快取

- 快取文件：`/cache/orders_cache.json`
- 快取有效期：15 秒
- 強制刷新：添加 `refresh=1` 參數

### 客戶端快取

- 內存快取：`orderCache` 變量
- 快取有效期：15 秒
- 清除快取：調用 `clearOrderCache()` 函數
