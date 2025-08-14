# TODO:

- [x] fix-order-service-api: 修正 orderService.ts 中的 API 端點：將 /api/get_orders_from_sheet.php 改為 /api/orders (priority: High)
- [x] fix-customer-service-api: 修正 customerService.ts 中的 API 端點：將 /api/get_customers_from_sheet.php 改為 /api/customers (priority: High)
- [x] update-api-base-logic: 更新 API URL 環境檢測邏輯，移除硬編碼的 Workers URL (priority: High)
- [x] fix-environment-detection: 修正 index.html 中的環境檢測邏輯，支援多種開發端口 (priority: High)
- [ ] missing-google-credentials: 缺少 Google Service Account 認證文件 service-account-key2.json，需要用戶提供 (priority: High)
- [ ] test-api-endpoints: 在獲得認證文件後測試本地和生產環境的 API 端點 (priority: Medium)
