-- 確保 admin_users 表存在並有正確的資料結構
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 啟用 RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 為測試創建一個預設管理員帳戶（如果不存在）
INSERT INTO public.admin_users (username, email, password_hash, full_name, role, is_active)
VALUES ('admin', 'admin@example.com', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '系統管理員', 'admin', true)
ON CONFLICT (username) DO NOTHING;

-- 確保管理員可以存取自己的資料
CREATE POLICY IF NOT EXISTS "管理員可查看自己資料" ON public.admin_users
    FOR SELECT 
    USING (id = auth.uid() OR is_super_admin());

-- 服務角色可以完全存取（用於 Edge Functions）
CREATE POLICY IF NOT EXISTS "服務角色完全存取" ON public.admin_users
    FOR ALL 
    USING (current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role');

-- 創建輔助函數確保 is_super_admin 函數存在
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = auth.uid() 
    AND role = 'super_admin' 
    AND is_active = true
  );
$$;