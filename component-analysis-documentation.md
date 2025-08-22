# 蘿蔔糕訂單系統 - 組件分析文檔

## 概述
這是一個基於 React + TypeScript + Tailwind CSS + shadcn/ui 的訂單管理系統，主要用於管理蘿蔔糕訂單和客戶資料。

## 設計系統分析

### 🎨 設計令牌 (Design Tokens)

#### 顏色系統
```css
/* 主要顏色 */
--color-primary: hsl(217, 91%, 60%)           /* 藍色 #3B82F6 */
--color-primary-foreground: hsl(210, 40%, 98%) /* 白色文字 */

/* 次要顏色 */
--color-secondary: hsl(210, 40%, 96.1%)       /* 淺灰色背景 */
--color-secondary-foreground: hsl(222.2, 47.4%, 11.2%) /* 深色文字 */

/* 狀態顏色 */
--color-destructive: hsl(0, 84.2%, 60.2%)     /* 紅色 #EF4444 */
--color-status-processing: #F97316            /* 橙色 - 處理中 */
--color-status-completed: #10B981             /* 綠色 - 已完成 */
--color-status-canceled: #EF4444              /* 紅色 - 已取消 */

/* 背景顏色 */
--color-background: hsl(0, 0%, 100%)          /* 白色背景 */
--color-card: hsl(0, 0%, 100%)                /* 卡片背景 */
--color-muted: hsl(210, 40%, 96.1%)           /* 靜音背景 */

/* 邊框顏色 */
--color-border: hsl(214.3, 31.8%, 91.4%)      /* 邊框顏色 */
--color-input: hsl(214.3, 31.8%, 91.4%)       /* 輸入框邊框 */

/* 文字顏色 */
--color-foreground: hsl(222.2, 84%, 4.9%)     /* 主要文字 */
--color-muted-foreground: hsl(215.4, 16.3%, 46.9%) /* 次要文字 */
```

#### 圓角系統
```css
--radius: 0.5rem; /* 8px - 主要圓角 */
```

#### 間距系統
- 緊湊模式：`p-2 sm:p-3` (8px-12px)
- 標準模式：`p-3 sm:p-4` (12px-16px)
- 大間距：`p-6` (24px)

#### 字體系統
- 主要字體：'Noto Sans TC', sans-serif
- 等寬字體：font-mono (用於訂單編號)
- 字重：font-medium (500), font-semibold (600), font-bold (700)

### 📱 響應式設計

#### 斷點系統
```css
--breakpoint-sm: 640px
--breakpoint-md: 768px
--breakpoint-lg: 1024px
--breakpoint-xl: 1280px
--breakpoint-2xl: 1536px
```

#### 網格系統
- 手機：3欄 `grid-cols-3`
- 平板：4-5欄 `sm:grid-cols-4 md:grid-cols-5`
- 桌面：7欄 `lg:grid-cols-7`

## 🧩 組件庫分析

### 1. 基礎 UI 組件 (shadcn/ui)

#### Button 組件
**變體 (Variants):**
- `default`: 主要按鈕 (藍色背景)
- `destructive`: 危險操作 (紅色背景)
- `outline`: 邊框按鈕
- `secondary`: 次要按鈕 (灰色背景)
- `ghost`: 透明按鈕
- `link`: 連結樣式

**尺寸 (Sizes):**
- `default`: h-10 px-4 py-2
- `sm`: h-9 px-3
- `lg`: h-11 px-8
- `icon`: h-10 w-10

#### Card 組件
**結構:**
- `Card`: 主容器 (圓角、邊框、陰影)
- `CardHeader`: 標題區域 (p-6)
- `CardTitle`: 標題文字 (text-2xl font-semibold)
- `CardDescription`: 描述文字 (text-sm text-muted-foreground)
- `CardContent`: 內容區域 (p-6 pt-0)
- `CardFooter`: 底部區域 (flex items-center p-6 pt-0)

#### Badge 組件
**變體:**
- `default`: 主要徽章 (藍色)
- `secondary`: 次要徽章 (灰色)
- `destructive`: 危險徽章 (紅色)
- `outline`: 邊框徽章

### 2. 業務組件

#### StatCard (統計卡片)
**用途:** 顯示統計數據
**屬性:**
- `title`: 標題文字
- `value`: 數值 (number | string)
- `compact`: 緊湊模式 (boolean)
- `className`: 自定義樣式

**設計特點:**
- 懸停效果：`hover:shadow-md hover:scale-[1.02]`
- 響應式字體大小
- 漸變背景支持

#### StatusBadge (狀態徽章)
**用途:** 顯示訂單狀態
**狀態類型:**
- `訂單確認中`: 藍色 (status-processing)
- `已抄單`: 橙色 (status-processing)
- `已出貨`: 綠色 (status-completed)
- `取消訂單`: 紅色 (status-canceled)

#### PaymentStatusBadge (款項狀態徽章)
**用途:** 顯示付款狀態
**狀態類型:**
- `未收費`: 灰色
- `已收費`: 綠色
- `待轉帳`: 黃色
- `未全款`: 紅色
- `特殊`: 紫色

#### ModernSidebar (現代側邊欄)
**功能:**
- 響應式設計 (桌面版/手機版)
- 可收合/展開
- 導航選單
- 資料來源切換
- 統計徽章顯示

**設計特點:**
- 漸變背景
- 懸停效果
- 圖標 + 文字導航
- 手機版使用 Sheet 組件

#### Dashboard (儀表板)
**功能:** 顯示訂單統計
**特點:**
- 響應式網格佈局
- 多種統計卡片
- 漸變背景色彩編碼
- 載入狀態處理

#### OrderList (訂單列表)
**功能:** 訂單管理主要組件
**特點:**
- 表格式佈局 (桌面版)
- 卡片式佈局 (手機版)
- 批次操作功能
- 分頁控制
- 選擇功能
- 狀態更新

**表格欄位:**
1. 選擇框
2. 訂單編號
3. 客戶資訊 (姓名、電話)
4. 商品摘要
5. 總金額
6. 到貨日期
7. 備註
8. 訂單狀態
9. 款項狀態
10. 操作按鈕

#### CustomerList (客戶列表)
**功能:** 客戶資料管理
**特點:**
- 響應式表格/卡片佈局
- 分頁功能
- 選擇功能
- 統計資訊顯示

**表格欄位:**
1. 選擇框
2. 客戶姓名
3. 電話
4. 地區
5. 地址
6. 購買次數
7. 購買商品

### 3. 交互模式

#### 懸停效果
- 卡片：`hover:shadow-md hover:scale-[1.02]`
- 表格行：`hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50`
- 按鈕：各種 hover 狀態

#### 選中狀態
- 表格行：`bg-gradient-to-r from-blue-100/70 to-indigo-100/70`
- 複選框：`data-[state=checked]:bg-blue-600`

#### 載入狀態
- 旋轉動畫：`animate-spin rounded-full border-b-2`
- 文字提示：「載入中...」、「處理中...」

### 4. 顏色語義化

#### 狀態顏色映射
```css
/* 訂單狀態 */
.status-processing { background-color: #F97316; } /* 橙色 */
.status-completed { background-color: #10B981; }  /* 綠色 */
.status-canceled { background-color: #EF4444; }   /* 紅色 */

/* 漸變背景 (統計卡片) */
- 總訂單：slate (灰色系)
- 確認中：blue (藍色系)
- 已抄單：orange (橙色系)
- 已出貨：green (綠色系)
- 取消：red (紅色系)
- 未收費：yellow (黃色系)
- 總金額：purple (紫色系)
```

### 5. 動畫系統

#### 關鍵幀動畫
```css
@keyframes fadeIn { opacity: 0 → 1 }
@keyframes fadeOut { opacity: 1 → 0 }
@keyframes slideInFromTop { translateY(-100%) → 0 }
@keyframes slideOutToTop { translateY(0) → -100% }
@keyframes zoomIn { scale(0.95) opacity(0) → scale(1) opacity(1) }
@keyframes zoomOut { scale(1) opacity(1) → scale(0.95) opacity(0) }
```

#### 過渡效果
- 通用：`transition-all duration-200`
- 顏色：`transition-colors`
- 陰影：`transition-shadow`

## 📐 佈局模式

### 1. 主佈局
- 側邊欄 + 主內容區
- 響應式：桌面版固定側邊欄，手機版抽屜式

### 2. 卡片佈局
- 統計卡片：響應式網格
- 內容卡片：全寬度，圓角邊框

### 3. 表格佈局
- 固定表頭
- 響應式欄位寬度
- 水平滾動支持

### 4. 分頁模式
- 每頁 20 筆資料
- 頁碼導航 (最多顯示 5 個)
- 上一頁/下一頁按鈕

## 🎯 設計原則

### 1. 一致性
- 統一的顏色系統
- 一致的間距規則
- 統一的圓角半徑

### 2. 可訪問性
- 適當的對比度
- 鍵盤導航支持
- 螢幕閱讀器友好

### 3. 響應式
- 移動優先設計
- 彈性佈局
- 適應性內容

### 4. 性能
- 虛擬化列表 (大數據)
- 懶加載
- 快取機制

## 📋 組件清單

### 基礎組件 (25個)
1. AuthProvider - 認證提供者
2. BatchDeleteConfirmDialog - 批次刪除確認對話框
3. CompactControlPanel - 緊湊控制面板
4. CustomerDashboard - 客戶儀表板
5. CustomerDetail - 客戶詳情
6. CustomerFilters - 客戶篩選器
7. CustomerList - 客戶列表
8. CustomerListMobile - 客戶列表手機版
9. Dashboard - 主儀表板
10. DuplicateOrdersDialog - 重複訂單對話框
11. ErrorBoundary - 錯誤邊界
12. MigrationPanel - 遷移面板
13. ModernSidebar - 現代側邊欄
14. OrderDetail - 訂單詳情
15. OrderFilters - 訂單篩選器
16. OrderItemEditor - 訂單項目編輯器
17. OrderList - 訂單列表
18. OrderListMobile - 訂單列表手機版
19. PaymentStatusBadge - 款項狀態徽章
20. PaymentStatusEditor - 款項狀態編輯器
21. ResponsivePageLayout - 響應式頁面佈局
22. ScrollToTopButton - 回到頂部按鈕
23. StatCard - 統計卡片
24. StatusBadge - 狀態徽章
25. VirtualizedList - 虛擬化列表

### UI 組件 (49個)
shadcn/ui 完整組件庫，包括 Button、Card、Badge、Dialog、Table 等

## 🚀 建議的 Figma 設計系統結構

### 1. 基礎 (Foundations)
- 顏色 (Colors)
- 字體 (Typography)
- 間距 (Spacing)
- 圓角 (Border Radius)
- 陰影 (Shadows)

### 2. 組件 (Components)
- 按鈕 (Buttons)
- 卡片 (Cards)
- 徽章 (Badges)
- 表格 (Tables)
- 表單 (Forms)

### 3. 模式 (Patterns)
- 導航 (Navigation)
- 列表 (Lists)
- 儀表板 (Dashboard)
- 對話框 (Dialogs)

### 4. 頁面 (Pages)
- 訂單管理
- 客戶管理
- 統計儀表板

這份文檔提供了完整的組件分析，可以作為在 Figma 中重建設計系統的參考資料。