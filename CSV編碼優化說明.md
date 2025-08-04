# CSV編碼優化說明

## 修正內容

### 1. 希望配達日邏輯修正 ✅
- **問題**：希望配達日可能在出貨日之前
- **解決方案**：
  - 如果希望配達日 ≤ 出貨日，自動設為出貨日+1
  - 如果沒有希望配達日，預設為出貨日+1
  - 確保希望配達日永遠不會早於出貨日

### 2. CSV編碼優化 ✅
- **問題**：下載的CSV檔案中文上傳後變亂碼
- **解決方案**：
  - 使用 `TextEncoder` 確保正確的UTF-8編碼
  - 採用純Unicode (UTF-8)格式，無BOM標記
  - 使用Windows標準的CRLF換行符 (`\r\n`)
  - 符合標準UTF-8編碼規範

### 3. UI優化 ✅
- **下載宅配CSV按鈕**：
  - 改為藍色邊框設計，更醒目
  - 提示訊息更新為「UTF-8編碼，可直接上傳使用」
  - 移除Excel下載選項，專注於CSV優化

## 編碼格式對比

| 格式 | BOM標記 | 特點 | 適用場景 |
|------|---------|------|----------|
| UTF-8 BOM | ✅ 有 (`\uFEFF`) | Excel容易識別 | Windows Excel |
| Unicode (UTF-8) | ❌ 無 | 標準UTF-8格式 | 現代系統、網頁應用 |

**目前使用**：Unicode (UTF-8) - 無BOM標記的純UTF-8編碼

## 技術細節

### CSV格式標準
```javascript
// 使用TextEncoder確保正確的UTF-8編碼（無BOM）
const encoder = new TextEncoder();
const csvBytes = encoder.encode(csvContent);

// 創建Blob時明確指定UTF-8
const blob = new Blob([csvBytes], {
  type: 'text/csv;charset=utf-8'
});
```

### 希望配達日邏輯
```javascript
// 檢查希望配達日是否在出貨日之前
if (d <= today) {
  const nextDay = new Date(today);
  nextDay.setDate(today.getDate() + 1);
  wishDate = formatDate(nextDay);
} else {
  wishDate = formatDate(d);
}
```

## 測試方式

1. **下載CSV檔案**：
   - 勾選訂單
   - 點擊「下載宅配CSV」按鈕
   - 檔案會自動下載

2. **檢查編碼**：
   - 用記事本開啟CSV檔案
   - 確認中文顯示正常
   - 檔案使用純UTF-8編碼（無BOM）

3. **上傳測試**：
   - 直接將下載的CSV檔案上傳到目標系統
   - 確認中文不會變成亂碼

## 按鈕配色說明

- **列印訂單**：橘色邊框 (border-orange-400)
- **下載宅配CSV**：藍色邊框 (border-blue-400) - 新優化
- **下載快速到店**：預設邊框

## 預期效果

下載的CSV檔案應該：
1. ✅ 中文字符正常顯示
2. ✅ 可直接上傳使用，無需額外轉換
3. ✅ 希望配達日邏輯正確（不早於出貨日）
4. ✅ 符合黑貓宅急便格式要求

## 注意事項

- 此優化專門針對CSV格式，移除了Excel下載選項
- 使用標準Unicode (UTF-8)編碼，無BOM標記
- 符合現代系統的UTF-8編碼標準
- 如果仍有問題，可能需要檢查上傳系統的編碼處理方式
