-- Remove unrestricted access policies and implement proper role-based security

-- Drop existing unrestricted API access policies
DROP POLICY IF EXISTS "API服務完全存取客戶資料" ON customers;
DROP POLICY IF EXISTS "API服務完全存取訂單資料" ON orders;
DROP POLICY IF EXISTS "API服務完全存取訂單商品明細" ON order_items;
DROP POLICY IF EXISTS "API服務完全存取審計日誌" ON audit_logs;
DROP POLICY IF EXISTS "API服務完全存取同步日誌" ON sync_logs;
DROP POLICY IF EXISTS "API服務完全存取商品資料" ON products;
DROP POLICY IF EXISTS "API服務完全存取配送設定" ON delivery_settings;
DROP POLICY IF EXISTS "API服務完全存取配送日期設定" ON delivery_date_settings;
DROP POLICY IF EXISTS "API服務完全存取系統設定" ON system_settings;

-- Create secure service role access function
CREATE OR REPLACE FUNCTION is_service_role_request()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  OR current_setting('request.jwt.sub', true) = 'service-role-user';
$$;

-- Create admin user verification function
CREATE OR REPLACE FUNCTION is_authenticated_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = auth.uid() 
    AND is_active = true
  );
$$;

-- Customers table - secure policies
CREATE POLICY "管理員和服務角色可讀取客戶資料" 
ON customers FOR SELECT 
USING (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可插入客戶資料" 
ON customers FOR INSERT 
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可更新客戶資料" 
ON customers FOR UPDATE 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可刪除客戶資料" 
ON customers FOR DELETE 
USING (is_authenticated_admin() OR is_service_role_request());

-- Orders table - secure policies
CREATE POLICY "管理員和服務角色可讀取訂單資料" 
ON orders FOR SELECT 
USING (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可插入訂單資料" 
ON orders FOR INSERT 
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可更新訂單資料" 
ON orders FOR UPDATE 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可刪除訂單資料" 
ON orders FOR DELETE 
USING (is_authenticated_admin() OR is_service_role_request());

-- Order items table - secure policies  
CREATE POLICY "管理員和服務角色可讀取訂單商品明細" 
ON order_items FOR SELECT 
USING (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可插入訂單商品明細" 
ON order_items FOR INSERT 
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可更新訂單商品明細" 
ON order_items FOR UPDATE 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

CREATE POLICY "管理員和服務角色可刪除訂單商品明細" 
ON order_items FOR DELETE 
USING (is_authenticated_admin() OR is_service_role_request());

-- Products table - secure policies
CREATE POLICY "管理員和服務角色可完全存取商品資料" 
ON products FOR ALL 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- Audit logs - restrict to authenticated admins only
CREATE POLICY "僅認證管理員可讀取審計日誌" 
ON audit_logs FOR SELECT 
USING (is_authenticated_admin());

-- Sync logs - restrict to authenticated admins only  
CREATE POLICY "僅認證管理員可存取同步日誌" 
ON sync_logs FOR ALL 
USING (is_authenticated_admin())
WITH CHECK (is_authenticated_admin());

-- Delivery settings - secure policies
CREATE POLICY "管理員和服務角色可完全存取配送設定" 
ON delivery_settings FOR ALL 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- Delivery date settings - secure policies
CREATE POLICY "管理員和服務角色可完全存取配送日期設定" 
ON delivery_date_settings FOR ALL 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());

-- System settings - secure policies
CREATE POLICY "管理員和服務角色可完全存取系統設定" 
ON system_settings FOR ALL 
USING (is_authenticated_admin() OR is_service_role_request())
WITH CHECK (is_authenticated_admin() OR is_service_role_request());