# Figma 組件規格說明書

## 🎯 如何使用這份文檔

這份文檔提供了詳細的組件規格，可以幫助您在 Figma 中重建整個設計系統。每個組件都包含：
- 視覺規格 (尺寸、顏色、字體)
- 變體 (Variants) 定義
- 狀態 (States) 說明
- 屬性 (Properties) 配置

## 📋 基礎組件規格

### 1. Button 組件

#### 基本規格
```
尺寸: 
- Default: 40px 高度, 16px 左右內距
- Small: 36px 高度, 12px 左右內距  
- Large: 44px 高度, 32px 左右內距
- Icon: 40px × 40px 正方形

圓角: 6px (rounded-md)
字體: 14px, Medium (500)
間隙: 8px (圖標與文字間)
```

#### 變體 (Variants)
```
Variant = Type
├── Default (主要按鈕)
│   ├── Background: #3B82F6
│   └── Text: #FFFFFF
├── Destructive (危險操作)
│   ├── Background: #EF4444
│   └── Text: #FFFFFF
├── Outline (邊框按鈕)
│   ├── Background: Transparent
│   ├── Border: 1px #E2E8F0
│   └── Text: #0F172A
├── Secondary (次要按鈕)
│   ├── Background: #F1F5F9
│   └── Text: #1E293B
├── Ghost (透明按鈕)
│   ├── Background: Transparent
│   └── Text: #0F172A
└── Link (連結樣式)
    ├── Background: Transparent
    ├── Text: #3B82F6
    └── Underline: 4px offset
```

#### 狀態 (States)
```
State = Interaction
├── Default (預設狀態)
├── Hover (懸停)
│   ├── Default: Background opacity 90%
│   ├── Outline: Background #F8FAFC
│   └── Ghost: Background #F8FAFC
├── Pressed (按下)
├── Disabled (禁用)
│   ├── Opacity: 50%
│   └── Cursor: not-allowed
└── Focus (焦點)
    ├── Ring: 2px #3B82F6
    └── Ring Offset: 2px
```

### 2. Card 組件

#### 基本規格
```
背景: #FFFFFF
邊框: 1px #E2E8F0
圓角: 8px (rounded-lg)
陰影: 0 1px 2px rgba(0,0,0,0.05)
```

#### 結構組件
```
Card Container
├── CardHeader (可選)
│   ├── Padding: 24px
│   └── Space Y: 6px
├── CardContent
│   ├── Padding: 24px
│   └── Padding Top: 0 (如果有 Header)
└── CardFooter (可選)
    ├── Padding: 24px
    ├── Padding Top: 0
    └── Display: Flex, Items Center
```

#### CardTitle 規格
```
字體: 24px, Semibold (600)
行高: 1.25 (leading-none)
字間距: -0.025em (tracking-tight)
顏色: #0F172A
```

#### CardDescription 規格
```
字體: 14px, Regular (400)
顏色: #64748B
```

### 3. Badge 組件

#### 基本規格
```
高度: Auto (由內容決定)
內距: 6px 10px (py-0.5 px-2.5)
字體: 12px, Semibold (600)
圓角: 9999px (rounded-full)
邊框: 1px
```

#### 變體 (Variants)
```
Variant = Type
├── Default
│   ├── Background: #3B82F6
│   ├── Text: #FFFFFF
│   └── Border: Transparent
├── Secondary  
│   ├── Background: #F1F5F9
│   ├── Text: #1E293B
│   └── Border: Transparent
├── Destructive
│   ├── Background: #EF4444
│   ├── Text: #FFFFFF
│   └── Border: Transparent
└── Outline
    ├── Background: Transparent
    ├── Text: #0F172A
    └── Border: 1px #E2E8F0
```

### 4. StatCard 組件 (自定義)

#### 基本規格
```
寬度: 100% (彈性)
最小高度: 
- Default: 80px
- Compact: 60px
圓角: 8px
邊框: 1px #E2E8F0
陰影: 0 1px 2px rgba(0,0,0,0.05)
```

#### 內部結構
```
Container
├── Title
│   ├── 字體: 10px-12px, Medium (500)
│   ├── 顏色: #64748B
│   ├── 轉換: Uppercase
│   ├── 字間距: 0.05em
│   └── 邊距底部: 2px-8px
└── Value
    ├── 字體: 18px-30px, Bold (700)
    ├── 顏色: #0F172A
    └── 響應式大小:
        ├── Mobile: 18px
        ├── Tablet: 20px
        └── Desktop: 24px-30px
```

#### 變體 (Variants) - 按統計類型
```
Variant = StatType
├── Total (總數)
│   └── Background: linear-gradient(slate-50, slate-100)
├── Pending (待處理)
│   └── Background: linear-gradient(blue-50, blue-100)
├── Processing (處理中)
│   └── Background: linear-gradient(orange-50, orange-100)
├── Completed (已完成)
│   └── Background: linear-gradient(green-50, green-100)
├── Canceled (已取消)
│   └── Background: linear-gradient(red-50, red-100)
├── Unpaid (未付款)
│   └── Background: linear-gradient(yellow-50, yellow-100)
└── Amount (金額)
    └── Background: linear-gradient(purple-50, purple-100)
```

#### 狀態 (States)
```
State = Interaction
├── Default
├── Hover
│   ├── 陰影: 0 4px 6px rgba(0,0,0,0.1)
│   └── 縮放: 102%
└── Loading
    └── Value: "..."
```

### 5. StatusBadge 組件 (自定義)

#### 基本規格
```
內距: 4px 8px
字體: 12px, Medium (500)
圓角: 9999px
顏色: 白色文字
最小寬度: 48px
文字對齊: 居中
```

#### 變體 (Variants)
```
Variant = Status
├── 訂單確認中
│   └── Background: #3B82F6
├── 已抄單  
│   └── Background: #F97316
├── 已出貨
│   └── Background: #10B981
└── 取消訂單
    └── Background: #EF4444
```

### 6. PaymentStatusBadge 組件 (自定義)

#### 基本規格
```
內距: 2px 8px
字體: 12px, Medium (500)
圓角: 4px
邊框: 1px
最小寬度: 48px
文字對齊: 居中
```

#### 變體 (Variants)
```
Variant = PaymentStatus
├── 未收費
│   ├── Background: #F3F4F6
│   ├── Text: #374151
│   └── Border: #9CA3AF
├── 已收費
│   ├── Background: #DCFCE7
│   ├── Text: #15803D
│   └── Border: #4ADE80
├── 待轉帳
│   ├── Background: #FEF3C7
│   ├── Text: #92400E
│   └── Border: #FACC15
├── 未全款
│   ├── Background: #FEE2E2
│   ├── Text: #B91C1C
│   └── Border: #EF4444
└── 特殊
    ├── Background: #F3E8FF
    ├── Text: #7C3AED
    └── Border: #A78BFA
```

## 📊 複雜組件規格

### 7. ModernSidebar 組件

#### 基本規格
```
寬度:
- 展開: 256px
- 收合: 64px
高度: 100vh (全螢幕高度)
背景: #FFFFFF
邊框右側: 1px #E2E8F0
```

#### 結構組件
```
Sidebar Container
├── Header Section
│   ├── 高度: Auto
│   ├── 內距: 16px
│   ├── 邊框底部: 1px #E2E8F0
│   └── 內容: Logo + 收合按鈕
├── Navigation Section
│   ├── 內距: 12px
│   ├── 間隙: 8px
│   └── 溢出: 自動滾動
└── Footer Section (可選)
    ├── 內距: 12px
    ├── 邊框頂部: 1px #E2E8F0
    └── 背景: #F8FAFC
```

#### 導航項目規格
```
Navigation Item
├── 高度: Auto (最小 48px)
├── 內距: 12px
├── 圓角: 6px
├── 間隙: 12px (圖標與文字)
├── 過渡: 200ms all
└── 狀態:
    ├── Default: 透明背景
    ├── Hover: #F8FAFC 背景
    └── Active: #3B82F6 背景, 白色文字
```

### 8. OrderList 表格組件

#### 表格基本規格
```
背景: #FFFFFF
邊框: 1px #E2E8F0
圓角: 8px
溢出: 隱藏
最大寬度: 1280px (7xl)
```

#### 表頭規格
```
Table Header
├── 背景: linear-gradient(slate-50, slate-100)
├── 邊框底部: 2px #E2E8F0
├── 內距: 12px
├── 字體: 14px, Semibold (600)
└── 顏色: #334155
```

#### 表格行規格
```
Table Row
├── 內距: 12px
├── 邊框底部: 1px #F1F5F9
├── 過渡: 200ms all
└── 狀態:
    ├── Default: 
    │   ├── 偶數行: #FFFFFF
    │   └── 奇數行: #FAFAFA
    ├── Hover: linear-gradient(blue-50/50, indigo-50/50)
    └── Selected: linear-gradient(blue-100/70, indigo-100/70)
```

#### 欄位寬度規格
```
Column Widths
├── 選擇框: 48px-64px
├── 訂單編號: 64px
├── 客戶資訊: 160px
├── 商品摘要: 288px
├── 總金額: 96px
├── 到貨日期: 112px
├── 備註: 128px
├── 訂單狀態: 112px
├── 款項狀態: 96px
└── 操作: 64px
```

### 9. Dashboard 統計網格

#### 網格規格
```
Grid Container
├── 顯示: Grid
├── 間隙: 8px-12px (響應式)
├── 欄數:
│   ├── Mobile: 3 欄
│   ├── Small: 4 欄
│   ├── Medium: 5 欄
│   └── Large: 7 欄
└── 邊距底部: 24px
```

#### 標題區域
```
Dashboard Header
├── 顯示: Flex
├── 對齊: Space Between
├── 邊距底部: 16px
└── 內容:
    ├── 標題: 20px, Semibold
    └── 載入提示: 14px, #64748B
```

## 🎨 顏色變體系統

### 統計卡片顏色系統
```
Color System for StatCards
├── Neutral (總數類)
│   ├── Background: linear-gradient(#F8FAFC, #F1F5F9)
│   └── Border: #E2E8F0
├── Info (資訊類)
│   ├── Background: linear-gradient(#EFF6FF, #DBEAFE)
│   └── Border: #BFDBFE
├── Warning (警告類)
│   ├── Background: linear-gradient(#FFF7ED, #FED7AA)
│   └── Border: #FDBA74
├── Success (成功類)
│   ├── Background: linear-gradient(#F0FDF4, #BBF7D0)
│   └── Border: #86EFAC
├── Error (錯誤類)
│   ├── Background: linear-gradient(#FEF2F2, #FECACA)
│   └── Border: #FCA5A5
└── Special (特殊類)
    ├── Background: linear-gradient(#FAF5FF, #E9D5FF)
    └── Border: #C4B5FD
```

## 📱 響應式規格

### 斷點系統
```
Breakpoints
├── Mobile: 0px - 639px
├── Small: 640px - 767px
├── Medium: 768px - 1023px
├── Large: 1024px - 1279px
└── Extra Large: 1280px+
```

### 組件響應式行為
```
Responsive Behavior
├── Sidebar
│   ├── Desktop: 固定側邊欄
│   └── Mobile: 抽屜式 (Sheet)
├── Table
│   ├── Desktop: 完整表格
│   └── Mobile: 卡片列表
├── StatCard Grid
│   ├── Mobile: 3 欄
│   ├── Tablet: 4-5 欄
│   └── Desktop: 7 欄
└── Typography
    ├── Mobile: 較小字體
    └── Desktop: 較大字體
```

## 🔧 Figma 實作建議

### 1. 建立設計令牌
- 創建顏色樣式庫
- 設定文字樣式
- 定義效果樣式 (陰影、模糊)

### 2. 組件層次結構
```
Components
├── 01-Foundations (基礎)
│   ├── Colors
│   ├── Typography
│   └── Effects
├── 02-Atoms (原子)
│   ├── Button
│   ├── Badge
│   └── Input
├── 03-Molecules (分子)
│   ├── StatCard
│   ├── StatusBadge
│   └── NavigationItem
├── 04-Organisms (有機體)
│   ├── Sidebar
│   ├── Table
│   └── Dashboard
└── 05-Templates (模板)
    ├── OrderManagement
    └── CustomerManagement
```

### 3. 變體設定
- 使用 Figma 的 Variants 功能
- 設定 Properties 面板
- 建立 Component Sets

### 4. 自動佈局
- 使用 Auto Layout 確保響應式
- 設定適當的 Constraints
- 配置 Padding 和 Gap

這份規格書提供了在 Figma 中重建整個設計系統所需的所有細節。