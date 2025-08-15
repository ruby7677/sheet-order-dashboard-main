-- 移除現有的 payment_status 約束
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- 移除現有的 status 約束  
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 建立新的約束，支援中文狀態值
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IN ('未收費', '已收費', '待轉帳', '未全款', '特殊', 'unpaid', 'partial', 'paid', 'refunded'));

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status IN ('訂單確認中', '已抄單', '已出貨', '取消訂單', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));