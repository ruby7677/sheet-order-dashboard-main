-- ===================================================================
-- Supabase Products 表 RLS 政策修復 SQL
-- 問題：前端能讀取但無法儲存/修改商品資料
-- 原因：products 表缺少適當的 RLS 政策設定
-- ===================================================================

-- 1. 檢查當前 RLS 政策狀態
SELECT 
    schemaname,
    tablename,
    rowsecurity,
    'RLS 是否啟用' as status
FROM pg_tables 
WHERE tablename = 'products' 
AND schemaname = 'public';

SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'products' 
AND schemaname = 'public';

-- ===================================================================
-- 修復方案選擇（請選擇其中一種方案執行）
-- ===================================================================

-- 方案 1：完全關閉 RLS（最簡單，適合管理後台）
-- 注意：這會讓匿名用戶也能完全存取
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 方案 2：設置適當的 RLS 政策（推薦，平衡安全性）
-- ===================================================================

-- 2a. 確保 RLS 啟用
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 2b. 創建允許匿名用戶完整存取的政策（適合管理系統）
CREATE POLICY "Allow anonymous full access to products" ON public.products
    FOR ALL 
    TO anon 
    USING (true)
    WITH CHECK (true);

-- ===================================================================
-- 方案 3：基於認證的政策（最安全，需要身份驗證）
-- ===================================================================

-- 3a. 確保 RLS 啟用
-- ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 3b. 只允許已認證用戶存取
-- CREATE POLICY "Allow authenticated users full access to products" ON public.products
--     FOR ALL 
--     TO authenticated 
--     USING (true)
--     WITH CHECK (true);

-- 3c. 允許匿名用戶只讀存取
-- CREATE POLICY "Allow anonymous read access to products" ON public.products
--     FOR SELECT 
--     TO anon 
--     USING (true);

-- ===================================================================
-- 驗證修復結果
-- ===================================================================

-- 檢查政策是否生效
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd as operation,
    CASE 
        WHEN qual IS NULL THEN 'No restrictions'
        ELSE 'Has restrictions' 
    END as access_conditions
FROM pg_policies 
WHERE tablename = 'products' 
AND schemaname = 'public'
ORDER BY policyname;

-- 檢查 RLS 狀態
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    CASE 
        WHEN rowsecurity THEN 'RLS 已啟用'
        ELSE 'RLS 已停用'
    END as status
FROM pg_tables 
WHERE tablename = 'products' 
AND schemaname = 'public';

-- ===================================================================
-- 執行建議
-- ===================================================================

/*
1. 在 Supabase Dashboard 的 SQL Editor 中執行檢查查詢
2. 根據您的安全需求選擇方案 1 或方案 2
3. 執行驗證查詢確認修復成功
4. 測試前端的 CRUD 操作

推薦執行順序：
- 如果這是內部管理系統：使用方案 1（關閉 RLS）
- 如果需要基本安全控制：使用方案 2（允許匿名存取）
- 如果需要嚴格權限控制：使用方案 3（需要身份驗證）

對於商品管理後台，推薦使用方案 2，既保持功能性又有基本的安全控制。
*/