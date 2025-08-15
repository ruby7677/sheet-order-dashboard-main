-- 修復管理員帳戶安全問題（修正版本）
-- 移除過於寬鬆的現有政策
DROP POLICY IF EXISTS "管理員可存取自己的帳號資料" ON admin_users;
DROP POLICY IF EXISTS "超級管理員可修改管理員帳號" ON admin_users;

-- 創建更嚴格的安全政策

-- 1. 管理員只能查看自己的基本資料
CREATE POLICY "管理員查看自己基本資料"
ON admin_users
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 2. 建立超級管理員角色檢查函數（安全定義者）
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = auth.uid() 
    AND role = 'super_admin' 
    AND is_active = true
  )
$$;

-- 3. 只有超級管理員可以查看所有管理員帳戶
CREATE POLICY "超級管理員查看所有帳戶"
ON admin_users
FOR SELECT
TO authenticated
USING (public.is_super_admin());

-- 4. 管理員只能更新自己的非關鍵資料
CREATE POLICY "管理員更新自己資料"
ON admin_users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 5. 只有超級管理員可以管理其他管理員帳戶
CREATE POLICY "超級管理員管理帳戶"
ON admin_users
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- 6. 創建一個安全視圖來隱藏密碼雜湊
CREATE OR REPLACE VIEW public.admin_users_safe AS
SELECT 
  id,
  username,
  email,
  full_name,
  role,
  last_login,
  is_active,
  created_at,
  updated_at
FROM admin_users;

-- 7. 建立密碼更新的專用函數
CREATE OR REPLACE FUNCTION public.update_admin_password(
  new_password_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 8. 建立管理員資料更新的安全函數
CREATE OR REPLACE FUNCTION public.update_admin_profile(
  new_full_name TEXT DEFAULT NULL,
  new_last_login TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
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