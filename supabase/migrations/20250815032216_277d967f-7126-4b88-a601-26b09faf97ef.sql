-- 檢查並修正 Supabase 資料庫結構，確保正確對應 Google Sheets 資料格式

-- 1. 檢查並修正 orders 表結構
-- 根據 Google Sheets 訂單資料格式，需要確保欄位完整對應
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(50),  -- 宅配時段 (上午/下午)
ADD COLUMN IF NOT EXISTS contact_method VARCHAR(50), -- 透過什麼聯繫賣家
ADD COLUMN IF NOT EXISTS social_id VARCHAR(255),     -- 社交軟體名字
ADD COLUMN IF NOT EXISTS google_sheet_id INTEGER; -- Google Sheets 中的 id 欄位

-- 修正訂單狀態列舉值以對應 Sheets 資料
ALTER TABLE orders ALTER COLUMN status SET DEFAULT '訂單確認中';

-- 修正付款狀態列舉值以對應 Sheets 資料  
ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT '未收費';

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
ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 1;            -- 排序順序

-- 更新商品 stock_status 預設值對應
ALTER TABLE products ALTER COLUMN stock_status SET DEFAULT 'available';

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

-- 6. 建立觸發器確保資料一致性（修正語法）
DROP TRIGGER IF EXISTS update_delivery_date_settings_updated_at ON delivery_date_settings;
CREATE TRIGGER update_delivery_date_settings_updated_at
    BEFORE UPDATE ON delivery_date_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 7. 插入預設的到貨日期設定
INSERT INTO delivery_date_settings (start_date, end_date, description, updated_by) 
VALUES (CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', '預設到貨日期設定', 'system')
ON CONFLICT DO NOTHING;