-- 修正安全性問題：為新建立的表啟用 RLS 並設定適當的政策

-- 1. 為 delivery_date_settings 表啟用 RLS
ALTER TABLE delivery_date_settings ENABLE ROW LEVEL SECURITY;

-- 2. 建立 delivery_date_settings 表的 RLS 政策
-- API服務完全存取配送日期設定
CREATE POLICY "API服務完全存取配送日期設定" 
ON delivery_date_settings 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- 公開讀取活躍配送日期設定
CREATE POLICY "公開讀取活躍配送日期設定" 
ON delivery_date_settings 
FOR SELECT 
USING (is_active = true);

-- 管理員可完全存取配送日期設定
CREATE POLICY "管理員可完全存取配送日期設定" 
ON delivery_date_settings 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid() 
    AND admin_users.is_active = true
)) 
WITH CHECK (EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.id = auth.uid() 
    AND admin_users.is_active = true
));

-- 3. 修正資料庫函數的安全設定，設置 search_path
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    date_prefix TEXT;
    sequence_num INTEGER;
    new_order_number TEXT;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.update_customer_stats()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    customer_uuid UUID;
BEGIN
    -- 確定要更新的客戶 ID
    IF TG_OP = 'DELETE' THEN
        customer_uuid := OLD.customer_id;
    ELSE
        customer_uuid := NEW.customer_id;
    END IF;
    
    -- 更新客戶統計
    UPDATE customers SET
        total_orders = (
            SELECT COUNT(*) 
            FROM orders 
            WHERE customer_id = customer_uuid 
            AND status NOT IN ('cancelled')
        ),
        total_amount = (
            SELECT COALESCE(SUM(total_amount), 0) 
            FROM orders 
            WHERE customer_id = customer_uuid 
            AND status NOT IN ('cancelled')
        ),
        last_order_date = (
            SELECT MAX(created_at) 
            FROM orders 
            WHERE customer_id = customer_uuid
        ),
        updated_at = NOW()
    WHERE id = customer_uuid;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_sync_operation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    record_id_val UUID;
    old_data_val JSONB;
    new_data_val JSONB;
BEGIN
    -- 確定記錄 ID 和資料
    IF TG_OP = 'DELETE' THEN
        record_id_val := OLD.id;
        old_data_val := to_jsonb(OLD);
        new_data_val := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        record_id_val := NEW.id;
        old_data_val := NULL;
        new_data_val := to_jsonb(NEW);
    ELSE -- UPDATE
        record_id_val := NEW.id;
        old_data_val := to_jsonb(OLD);
        new_data_val := to_jsonb(NEW);
    END IF;
    
    -- 插入同步日誌
    INSERT INTO sync_logs (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        sync_status
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        record_id_val,
        old_data_val,
        new_data_val,
        'pending'
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_operation()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    record_id_val UUID;
    old_data_val JSONB;
    new_data_val JSONB;
    current_user_id UUID;
    current_user_info JSONB;
BEGIN
    -- 確定記錄 ID 和資料
    IF TG_OP = 'DELETE' THEN
        record_id_val := OLD.id;
        old_data_val := to_jsonb(OLD);
        new_data_val := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        record_id_val := NEW.id;
        old_data_val := NULL;
        new_data_val := to_jsonb(NEW);
    ELSE -- UPDATE
        record_id_val := NEW.id;
        old_data_val := to_jsonb(OLD);
        new_data_val := to_jsonb(NEW);
    END IF;
    
    -- 嘗試獲取當前使用者資訊 (從 Supabase auth)
    BEGIN
        current_user_id := auth.uid();
        current_user_info := jsonb_build_object(
            'user_id', auth.uid(),
            'email', auth.email(),
            'role', auth.role()
        );
    EXCEPTION WHEN OTHERS THEN
        current_user_id := NULL;
        current_user_info := NULL;
    END;
    
    -- 插入審計日誌
    INSERT INTO audit_logs (
        table_name,
        operation,
        record_id,
        old_data,
        new_data,
        user_id,
        user_info,
        ip_address,
        user_agent
    ) VALUES (
        TG_TABLE_NAME,
        TG_OP,
        record_id_val,
        old_data_val,
        new_data_val,
        current_user_id,
        current_user_info,
        inet_client_addr(),
        current_setting('request.headers', true)::jsonb->>'user-agent'
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_data_integrity()
RETURNS TABLE(check_name text, status text, issue_count integer, details text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 檢查孤立的訂單 (客戶不存在)
    RETURN QUERY
    SELECT 
        '孤立訂單檢查'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN '正常' ELSE '異常' END::TEXT,
        COUNT(*)::INTEGER,
        '訂單存在但對應客戶不存在: ' || string_agg(order_number, ', ')::TEXT
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE c.id IS NULL;
    
    -- 檢查孤立的訂單商品 (商品不存在)
    RETURN QUERY
    SELECT 
        '孤立商品參考檢查'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN '正常' ELSE '異常' END::TEXT,
        COUNT(*)::INTEGER,
        '訂單商品參考不存在的商品 ID 數量'::TEXT
    FROM order_items oi
    LEFT JOIN products p ON oi.product_id = p.id
    WHERE p.id IS NULL;
    
    -- 檢查商品庫存狀態與數量不一致
    RETURN QUERY
    SELECT 
        '商品庫存一致性檢查'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN '正常' ELSE '異常' END::TEXT,
        COUNT(*)::INTEGER,
        '庫存狀態與數量不一致的商品數量'::TEXT
    FROM products
    WHERE (
        (stock_status = 'out_of_stock' AND stock_quantity > 0) OR
        (stock_status = 'in_stock' AND stock_quantity = 0) OR
        (stock_status = 'low_stock' AND stock_quantity > 10)
    );
    
    -- 檢查過期的配送設定
    RETURN QUERY
    SELECT 
        '配送設定有效性檢查'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN '正常' ELSE '異常' END::TEXT,
        COUNT(*)::INTEGER,
        '過期或無效的配送設定數量'::TEXT
    FROM delivery_settings
    WHERE is_active = true AND (
        end_date < CURRENT_DATE OR
        start_date > end_date
    );
    
    -- 檢查訂單金額與明細不符
    RETURN QUERY
    SELECT 
        '訂單金額一致性檢查'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN '正常' ELSE '異常' END::TEXT,
        COUNT(*)::INTEGER,
        '訂單總金額與明細金額不符的訂單數量'::TEXT
    FROM orders o
    LEFT JOIN (
        SELECT 
            order_id,
            SUM(total_price) as calculated_total
        FROM order_items
        GROUP BY order_id
    ) oi ON o.id = oi.order_id
    WHERE ABS(COALESCE(o.total_amount, 0) - COALESCE(oi.calculated_total, 0)) > 0.01;
END;
$$;