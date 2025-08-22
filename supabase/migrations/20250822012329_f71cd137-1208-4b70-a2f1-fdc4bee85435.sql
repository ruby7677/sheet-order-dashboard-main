-- Phase 1: Fix Critical Data Exposure - Remove Public RLS Policies
-- Remove dangerous public access policies that expose sensitive data

-- Remove public access to customers table
DROP POLICY IF EXISTS "公開讀取活躍客戶資料" ON customers;
DROP POLICY IF EXISTS "檢視者可讀取客戶資料" ON customers;

-- Remove public access to orders table  
DROP POLICY IF EXISTS "公開讀取訂單資料" ON orders;
DROP POLICY IF EXISTS "檢視者可讀取訂單資料" ON orders;

-- Remove public access to order_items table
DROP POLICY IF EXISTS "公開讀取訂單商品明細" ON order_items;
DROP POLICY IF EXISTS "檢視者可讀取訂單商品明細" ON order_items;

-- Remove public access to admin_users table
DROP POLICY IF EXISTS "公開讀取管理員基本資料" ON admin_users;
DROP POLICY IF EXISTS "管理員查看自己基本資料" ON admin_users;
DROP POLICY IF EXISTS "admin_can_view_own_data" ON admin_users;

-- Ensure only authenticated admins and service role can access sensitive data
-- Update customers policies
CREATE POLICY "僅認證管理員可完全存取客戶資料" ON customers
FOR ALL USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- Update orders policies  
CREATE POLICY "僅認證管理員可完全存取訂單資料" ON orders
FOR ALL USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- Update order_items policies
CREATE POLICY "僅認證管理員可完全存取訂單明細" ON order_items  
FOR ALL USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- Update admin_users policies - remove self-access, only super admin access
CREATE POLICY "僅超級管理員可完全存取管理員資料" ON admin_users
FOR ALL USING (is_super_admin() OR is_service_role_request())
WITH CHECK (is_super_admin() OR is_service_role_request());

-- Remove public access to audit and sync logs
DROP POLICY IF EXISTS "管理員可讀取審計日誌" ON audit_logs;
DROP POLICY IF EXISTS "管理員可完全存取同步日誌" ON sync_logs;

-- Secure audit and sync logs access
CREATE POLICY "僅超級管理員可存取審計日誌" ON audit_logs
FOR ALL USING (is_super_admin() OR is_service_role_request())
WITH CHECK (is_super_admin() OR is_service_role_request());

CREATE POLICY "僅超級管理員可存取同步日誌" ON sync_logs
FOR ALL USING (is_super_admin() OR is_service_role_request()) 
WITH CHECK (is_super_admin() OR is_service_role_request());

-- Update admin password hashes to use proper bcrypt (replace plaintext)
-- Generate proper bcrypt hash for admin123 password
UPDATE admin_users 
SET password_hash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' -- bcrypt hash of 'admin123'
WHERE password_hash = 'admin123' OR password_hash IS NULL;

-- Add constraint to ensure password_hash is never null or plaintext
ALTER TABLE admin_users ADD CONSTRAINT password_hash_not_null CHECK (password_hash IS NOT NULL);
ALTER TABLE admin_users ADD CONSTRAINT password_hash_not_plaintext CHECK (length(password_hash) > 20);