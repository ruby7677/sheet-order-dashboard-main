# 設計令牌提取報告

## 🎨 顏色令牌 (Color Tokens)

### 主要品牌色彩
```css
/* 主色調 - 藍色系 */
Primary Blue: hsl(217, 91%, 60%) → #3B82F6
Primary Blue Light: hsl(210, 40%, 98%) → #F8FAFC

/* 次要色彩 - 灰色系 */
Secondary Gray: hsl(210, 40%, 96.1%) → #F1F5F9
Secondary Dark: hsl(222.2, 47.4%, 11.2%) → #1E293B

/* 背景色彩 */
Background White: hsl(0, 0%, 100%) → #FFFFFF
Muted Background: hsl(210, 40%, 96.1%) → #F1F5F9
Card Background: hsl(0, 0%, 100%) → #FFFFFF
```

### 狀態色彩系統
```css
/* 成功狀態 - 綠色 */
Success: #10B981 (已出貨、已收費)

/* 警告狀態 - 橙色/黃色 */
Warning Orange: #F97316 (處理中、已抄單)
Warning Yellow: #FACC15 (待轉帳、未收費)

/* 錯誤狀態 - 紅色 */
Error: #EF4444 (取消訂單、未全款)
Destructive: hsl(0, 84.2%, 60.2%) → #EF4444

/* 資訊狀態 - 藍色 */
Info: hsl(217, 91%, 60%) → #3B82F6 (訂單確認中)

/* 特殊狀態 - 紫色 */
Special: #8B5CF6 (特殊款項狀態)
```

### 文字色彩
```css
/* 主要文字 */
Foreground: hsl(222.2, 84%, 4.9%) → #0F172A

/* 次要文字 */
Muted Foreground: hsl(215.4, 16.3%, 46.9%) → #64748B

/* 邊框色彩 */
Border: hsl(214.3, 31.8%, 91.4%) → #E2E8F0
Input Border: hsl(214.3, 31.8%, 91.4%) → #E2E8F0
```

### 漸變色彩 (統計卡片專用)
```css
/* 統計卡片漸變背景 */
Slate Gradient: from-slate-50 to-slate-100
Blue Gradient: from-blue-50 to-blue-100  
Orange Gradient: from-orange-50 to-orange-100
Green Gradient: from-green-50 to-green-100
Red Gradient: from-red-50 to-red-100
Yellow Gradient: from-yellow-50 to-yellow-100
Purple Gradient: from-purple-50 to-purple-100
Stone Gradient: from-stone-50 to-stone-100
Violet Gradient: from-violet-50 to-violet-100
Neutral Gradient: from-neutral-50 to-neutral-100
```

## 📏 間距令牌 (Spacing Tokens)

### 基礎間距系統
```css
/* Tailwind 間距對應 */
0.5rem = 8px   (p-2)
0.75rem = 12px (p-3)
1rem = 16px    (p-4)
1.5rem = 24px  (p-6)
2rem = 32px    (p-8)

/* 組件特定間距 */
Card Padding: 24px (p-6)
Compact Padding: 8px-12px (p-2 sm:p-3)
Standard Padding: 12px-16px (p-3 sm:p-4)
Button Padding: 16px (px-4 py-2)
Small Button: 12px (px-3)
```

### 間隙系統
```css
/* 網格間隙 */
Small Gap: 8px (gap-2)
Medium Gap: 12px (gap-3)
Large Gap: 16px (gap-4)

/* 響應式間隙 */
Mobile Gap: 8px (gap-2)
Tablet Gap: 12px (sm:gap-3)
Desktop Gap: 16px (lg:gap-4)
```

## 🔤 字體令牌 (Typography Tokens)

### 字體家族
```css
/* 主要字體 */
Primary Font: 'Noto Sans TC', sans-serif

/* 等寬字體 (訂單編號等) */
Monospace Font: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace
```

### 字體大小系統
```css
/* 標題系統 */
H1: text-2xl (24px) - CardTitle
H2: text-xl (20px) - Dashboard 標題
H3: text-lg (18px) - Sidebar 標題

/* 內文系統 */
Body Large: text-base (16px) - 一般內容
Body: text-sm (14px) - 表格內容、按鈕文字
Body Small: text-xs (12px) - 徽章、說明文字
Body Tiny: text-[10px] (10px) - 緊湊模式標題

/* 特殊用途 */
Display Large: text-3xl (30px) - 統計數值 (桌面)
Display Medium: text-2xl (24px) - 統計數值 (平板)
Display Small: text-xl (20px) - 統計數值 (手機)
```

### 字體重量
```css
/* 字重系統 */
Regular: font-normal (400)
Medium: font-medium (500) - 按鈕、標籤
Semibold: font-semibold (600) - 標題、重要文字
Bold: font-bold (700) - 統計數值、強調文字
```

### 行高系統
```css
/* 行高 */
Tight: leading-tight (1.25) - 標題
Normal: leading-normal (1.5) - 一般文字
Relaxed: leading-relaxed (1.625) - 長文本
```

## 📐 尺寸令牌 (Size Tokens)

### 圓角系統
```css
/* 主要圓角 */
Border Radius: 8px (0.5rem) - 卡片、按鈕
Small Radius: 4px (rounded-sm) - 小元素
Large Radius: 12px (rounded-lg) - 大卡片
Full Radius: 9999px (rounded-full) - 徽章、頭像
```

### 高度系統
```css
/* 按鈕高度 */
Button Default: 40px (h-10)
Button Small: 36px (h-9)
Button Large: 44px (h-11)
Button Icon: 40px (h-10 w-10)

/* 輸入框高度 */
Input Default: 40px (h-10)
Input Small: 32px (h-8)

/* 統計卡片高度 */
StatCard Default: 80px (min-h-[80px])
StatCard Compact: 60px (min-h-[60px])
```

### 寬度系統
```css
/* 側邊欄寬度 */
Sidebar Expanded: 256px (w-64)
Sidebar Collapsed: 64px (w-16)

/* 表格欄位寬度 */
Checkbox Column: 40px-64px (w-10 md:w-16)
ID Column: 64px (w-16)
Name Column: 160px (w-40)
Action Column: 64px (w-16)
```

## 🎭 陰影令牌 (Shadow Tokens)

### 陰影系統
```css
/* 卡片陰影 */
Card Shadow: shadow-sm (0 1px 2px 0 rgb(0 0 0 / 0.05))
Card Hover: shadow-md (0 4px 6px -1px rgb(0 0 0 / 0.1))

/* 按鈕陰影 */
Button Shadow: 無預設陰影
Button Focus: ring-2 ring-ring ring-offset-2

/* 下拉陰影 */
Dropdown Shadow: shadow-lg (0 10px 15px -3px rgb(0 0 0 / 0.1))
```

## 🔄 動畫令牌 (Animation Tokens)

### 過渡時間
```css
/* 標準過渡 */
Fast: 150ms
Standard: 200ms (transition-all duration-200)
Slow: 300ms

/* 特殊動畫 */
Hover Scale: hover:scale-[1.02]
Loading Spin: animate-spin
```

### 緩動函數
```css
/* Tailwind 預設緩動 */
Ease: cubic-bezier(0.4, 0, 0.2, 1)
Ease In: cubic-bezier(0.4, 0, 1, 1)
Ease Out: cubic-bezier(0, 0, 0.2, 1)
```

## 📱 響應式令牌 (Responsive Tokens)

### 斷點系統
```css
/* 媒體查詢斷點 */
Mobile: 0px (預設)
Small: 640px (sm:)
Medium: 768px (md:)
Large: 1024px (lg:)
Extra Large: 1280px (xl:)
2X Large: 1536px (2xl:)
```

### 網格系統
```css
/* 統計卡片網格 */
Mobile: 3 columns (grid-cols-3)
Small: 4 columns (sm:grid-cols-4)
Medium: 5 columns (md:grid-cols-5)
Large: 7 columns (lg:grid-cols-7)

/* 表格顯示 */
Mobile: 隱藏表格，顯示卡片
Desktop: 顯示完整表格
```

## 🎯 組件特定令牌

### 狀態徽章
```css
/* StatusBadge 樣式 */
Padding: 4px 8px (px-2 py-0.5)
Font Size: 12px (text-xs)
Font Weight: 500 (font-medium)
Border Radius: 9999px (rounded-full)
Min Width: 48px
Text Align: center
```

### 統計卡片
```css
/* StatCard 樣式 */
Min Height Default: 80px
Min Height Compact: 60px
Padding Default: 12px-16px (p-3 sm:p-4)
Padding Compact: 8px-12px (p-2 sm:p-3)
Hover Transform: scale(1.02)
Transition: all 200ms
```

### 表格樣式
```css
/* 表格行 */
Row Padding: 12px (p-3)
Hover Background: gradient blue-50/50 to indigo-50/50
Selected Background: gradient blue-100/70 to indigo-100/70
Stripe Background: slate-50/30 (奇偶行)
```

這些設計令牌可以直接在 Figma 中創建為樣式庫，確保設計的一致性和可維護性。