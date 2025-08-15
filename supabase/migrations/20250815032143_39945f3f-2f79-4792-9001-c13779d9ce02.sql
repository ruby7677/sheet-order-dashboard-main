-- 檢查並修正 Supabase 資料庫結構，確保正確對應 Google Sheets 資料格式

-- 1. 檢查並修正 orders 表結構
-- 根據 Google Sheets 訂單資料格式，需要確保欄位完整對應
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(50),  -- 宅配時段 (上午/下午)
ADD COLUMN IF NOT EXISTS contact_method VARCHAR(50), -- 透過什麼聯繫賣家
ADD COLUMN IF NOT EXISTS social_id VARCHAR(255),     -- 社交軟體名字
ADD COLUMN IF NOT EXISTS google_sheet_id INTEGER UNIQUE; -- Google Sheets 中的 id 欄位

-- 修正訂單狀態列舉值以對應 Sheets 資料
DO $$
BEGIN
    -- 檢查並更新 status 欄位的 default 值
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'status' 
        AND column_default LIKE '%pending%'
    ) THEN
        ALTER TABLE orders ALTER COLUMN status SET DEFAULT '訂單確認中';
    END IF;
END $$;

-- 修正付款狀態列舉值以對應 Sheets 資料  
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' 
        AND column_name = 'payment_status' 
        AND column_default LIKE '%unpaid%'
    ) THEN
        ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT '未收費';
    END IF;
END $$;

-- 2. 檢查並修正 customers 表結構
-- 根據客戶名單格式，確保欄位對應
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS contact_method VARCHAR(50), -- 透過什麼聯繫賣家
ADD COLUMN IF NOT EXISTS social_id VARCHAR(255),     -- 社交軟體名字  
ADD COLUMN IF NOT EXISTS delivery_method VARCHAR(50); -- 取貨方式

-- 3. 檢查並修正 products 表結構
-- 根據商品管理參考資料，確保商品表結構完整
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT '條',           -- 單位
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 1,            -- 排序順序
ADD COLUMN IF NOT EXISTS is_vegetarian BOOLEAN DEFAULT false;     -- 是否素食

-- 更新商品 stock_status 預設值對應
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'products' 
        AND column_name = 'stock_status' 
        AND column_default LIKE '%available%'
    ) THEN
        ALTER TABLE products ALTER COLUMN stock_status SET DEFAULT 'available';
    END IF;
END $$;

-- 4. 建立 delivery_date_settings 表對應到貨日期設定
CREATE TABLE IF NOT EXISTS delivery_date_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    updated_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 建立索引優化查詢效能
CREATE INDEX IF NOT EXISTS idx_orders_google_sheet_id ON orders(google_sheet_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_contact_method ON orders(contact_method);
CREATE INDEX IF NOT EXISTS idx_customers_contact_method ON customers(contact_method);
CREATE INDEX IF NOT EXISTS idx_products_sort_order ON products(sort_order);
CREATE INDEX IF NOT EXISTS idx_delivery_date_settings_active ON delivery_date_settings(is_active, start_date, end_date);

-- 6. 建立觸發器確保資料一致性
CREATE TRIGGER IF NOT EXISTS update_delivery_date_settings_updated_at
    BEFORE UPDATE ON delivery_date_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 插入預設的到貨日期設定
INSERT INTO delivery_date_settings (start_date, end_date, description, updated_by) 
VALUES (CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', '預設到貨日期設定', 'system')
ON CONFLICT DO NOTHING;

-- 8. 更新訂單表的 order_number 生成邏輯，確保與 Google Sheets 格式一致
CREATE OR REPLACE FUNCTION generate_order_number_from_sheet()
RETURNS TRIGGER AS $$
DECLARE
    date_prefix TEXT;
    sequence_num INTEGER;
    new_order_number TEXT;
BEGIN
    -- 如果已有 order_number 就不覆蓋（來自 Google Sheets 的資料）
    IF NEW.order_number IS NOT NULL AND NEW.order_number != '' THEN
        RETURN NEW;
    END IF;
    
    -- 生成日期前綴 (YYYYMMDD)
    date_prefix := to_char(NOW(), 'YYYYMMDD');
    
    -- 獲取當日訂單序號
    SELECT COALESCE(MAX(CAST(RIGHT(order_number, 3) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE order_number LIKE date_prefix || '%';
    
    -- 生成新的訂單編號 (格式: YYYYMMDD001)
    new_order_number := date_prefix || LPAD(sequence_num::TEXT, 3, '0');
    
    NEW.order_number := new_order_number;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. 建立資料同步檢查函數
CREATE OR REPLACE FUNCTION validate_google_sheets_data_mapping()
RETURNS TABLE(table_name TEXT, field_name TEXT, mapping_status TEXT, notes TEXT) AS $$
BEGIN
    -- 檢查訂單表欄位對應
    RETURN QUERY
    SELECT 
        'orders'::TEXT,
        'google_sheet_mapping'::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'google_sheet_id') 
            THEN '完整'::TEXT 
            ELSE '缺失'::TEXT 
        END,
        '對應 Google Sheets id 欄位'::TEXT;
    
    -- 檢查客戶表欄位對應
    RETURN QUERY
    SELECT 
        'customers'::TEXT,
        'contact_fields'::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'contact_method') 
            THEN '完整'::TEXT 
            ELSE '缺失'::TEXT 
        END,
        '對應客戶聯繫方式欄位'::TEXT;
    
    -- 檢查商品表欄位對應
    RETURN QUERY
    SELECT 
        'products'::TEXT,
        'product_management_fields'::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sort_order') 
            THEN '完整'::TEXT 
            ELSE '缺失'::TEXT 
        END,
        '對應商品管理欄位'::TEXT;
    
    -- 檢查到貨日期設定表
    RETURN QUERY
    SELECT 
        'delivery_date_settings'::TEXT,
        'delivery_date_management'::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'delivery_date_settings') 
            THEN '完整'::TEXT 
            ELSE '缺失'::TEXT 
        END,
        '到貨日期設定功能'::TEXT;
END;
$$ LANGUAGE plpgsql;