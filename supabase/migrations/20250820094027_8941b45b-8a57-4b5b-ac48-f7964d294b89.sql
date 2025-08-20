-- 更新管理員帳號的密碼為明文（用於測試）
-- 生產環境應該使用更安全的哈希方式
UPDATE admin_users 
SET password_hash = 'admin123',
    updated_at = now()
WHERE username = 'manager';

-- 如果需要，也可以新增一個測試用的管理員帳號
INSERT INTO admin_users (
  id,
  username, 
  email, 
  password_hash, 
  full_name, 
  role, 
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'admin',
  'admin@example.com',
  'admin123',
  '系統管理員',
  'admin',
  true,
  now(),
  now()
) ON CONFLICT (username) DO UPDATE SET
  password_hash = 'admin123',
  updated_at = now();