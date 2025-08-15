-- 修改角色檢查約束以包含 super_admin
ALTER TABLE public.admin_users DROP CONSTRAINT admin_users_role_check;

ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check 
CHECK (role::text = ANY (ARRAY['super_admin'::character varying, 'admin'::character varying, 'manager'::character varying, 'viewer'::character varying]::text[]));

-- 創建超級管理員帳號
INSERT INTO public.admin_users (
  username, 
  password_hash, 
  email, 
  full_name, 
  role, 
  is_active
) VALUES (
  'superadmin',
  '$2b$10$GVxSPB1V.MQ1GcqGJ8YOIeHNRo8HVU1WdgOD8fFJrCB3Lz5QpKw8e', -- 'SecureAdminPassword123!' hashed
  'admin@company.com',
  '系統超級管理員',
  'super_admin',
  true
) ON CONFLICT (username) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active;