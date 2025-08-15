-- 為 orders 表的 google_sheet_id 建立唯一約束
ALTER TABLE public.orders ADD CONSTRAINT unique_google_sheet_id UNIQUE (google_sheet_id);

-- 為 customers 表的 phone 建立唯一約束
ALTER TABLE public.customers ADD CONSTRAINT unique_customer_phone UNIQUE (phone);

-- 為 orders 表的 order_number 也建立唯一約束（如果還沒有的話）
ALTER TABLE public.orders ADD CONSTRAINT unique_order_number UNIQUE (order_number);