# 任務清單（todolist.md）

## 1. 環境建置
- [x] Node.js 18+ 安裝
- [x] XAMPP 8+ 安裝與 Apache 配置
- [x] PHP 依賴（google/apiclient）安裝
- [x] Google API 憑證設置
- [x] npm install

## 2. 前端開發
- [x] 設計 Dashboard UI（Tailwind CSS）
- [x] 訂單列表元件開發（React）
- [x] 訂單搜尋/篩選功能
- [x] API 服務整合（src/services）
- [x] 錯誤訊息與 loading 狀態處理
- [x] 批次刪除訂單功能（BatchDeleteConfirmDialog 元件）
- [x] 批次刪除 API 服務整合（batchDeleteOrders）
- [x] 重複訂單檢測功能（DuplicateOrdersDialog 元件）
- [x] 電話號碼重複警示（OrderList 元件）
- [x] 重複訂單統計按鈕（Index 頁面）
- [x] 自動重複訂單警示功能（首次載入彈窗）
- [x] 重複訂單查看詳情功能修正
- [x] 分頁按鈕遮擋問題修正（客戶頁面與訂單頁面）
- [ ] 單元測試（Jest）

## 3. 後端開發
- [x] 建立 get_orders_from_sheet.php API 端點
- [x] Google Sheets API 串接與授權
- [x] 快取機制設計與實作
- [x] API 響應格式統一
- [x] 錯誤處理與日誌
- [x] 批次刪除訂單 API（batch_delete_orders.php）
- [x] 批次刪除後 ID 重新排序機制（N欄）
- [x] 單個刪除訂單 ID 重新排序機制（N欄）
- [x] ID 重新排序驗證腳本（test_batch_delete_id_reorder.php）
- [x] API 測試（Postman/curl）

## 4. 部署與驗證
- [x] 前端 npm run build 與 dist/ 上傳
- [x] 後端 api/ 上傳與 cache/ 權限設置
- [x] .htaccess 配置與驗證
- [x] 伺服器端整合測試

## 5. 版本控制
- [x] 建立 develop/feature/bugfix 分支
- [x] 定期合併 main 分支

## 6. 訂單詳情編輯功能 ✨ NEW
- [x] 建立 OrderItemEditor 組件
  - [x] 商品數量調整界面（+/- 按鈕）
  - [x] 新增商品下拉選單
  - [x] 刪除商品功能
  - [x] 即時金額計算
- [x] 修改 OrderDetail 組件
  - [x] 添加「編輯商品」按鈕
  - [x] 整合商品編輯對話框
  - [x] 顯示編輯後的商品清單
- [x] 建立後端 API
  - [x] update_order_items.php API 端點
  - [x] 接收新的商品清單
  - [x] 重新計算總金額
  - [x] 更新 Google Sheets 中的商品和金額欄位
  - [x] 清除相關快取
- [x] 前端服務整合
  - [x] 擴展 orderService.ts
  - [x] 新增 updateOrderItems 函數
  - [x] 處理商品資料格式轉換
  - [x] 整合快取清除機制
- [x] 類型定義和工具函數
  - [x] 定義商品編輯相關的介面
  - [x] 商品價格對應邏輯
  - [x] 金額計算函數
- [x] 文檔撰寫
  - [x] 功能使用指南（ORDER_ITEM_EDITOR_GUIDE.md）

---
請依照進度勾選，完成後同步更新本清單。
