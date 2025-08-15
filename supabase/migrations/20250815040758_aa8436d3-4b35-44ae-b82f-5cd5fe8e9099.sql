-- 修復函數安全問題：設定搜尋路徑
-- 修正超級管理員檢查函數
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = auth.uid() 
    AND role = 'super_admin' 
    AND is_active = true
  )
$$;

-- 修正密碼更新函數
CREATE OR REPLACE FUNCTION public.update_admin_password(
  new_password_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 只允許用戶更新自己的密碼
  UPDATE admin_users 
  SET 
    password_hash = new_password_hash,
    updated_at = NOW()
  WHERE id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- 修正管理員資料更新函數
CREATE OR REPLACE FUNCTION public.update_admin_profile(
  new_full_name TEXT DEFAULT NULL,
  new_last_login TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE admin_users 
  SET 
    full_name = COALESCE(new_full_name, full_name),
    last_login = COALESCE(new_last_login, last_login),
    updated_at = NOW()
  WHERE id = auth.uid();
  
  RETURN FOUND;
END;
$$;

-- 移除安全有問題的視圖
DROP VIEW IF EXISTS public.admin_users_safe;