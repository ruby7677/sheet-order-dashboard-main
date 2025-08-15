-- 添加 delivery_method 欄位到 orders 表
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(50);

-- 更新現有資料的預設值
UPDATE public.orders 
SET delivery_method = '宅配到府' 
WHERE delivery_method IS NULL;

-- 檢查是否還有其他缺少的欄位，根據 Google Sheets 結構添加
-- 添加可能缺少的其他欄位
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- 創建索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_orders_delivery_method ON public.orders(delivery_method);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders(delivery_date);