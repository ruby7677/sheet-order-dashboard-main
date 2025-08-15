-- Fix security vulnerability: Remove service role read access to sensitive customer data
-- Only authenticated admins should be able to read customer personal information

-- Drop the overly permissive read policy that allows service role access
DROP POLICY IF EXISTS "管理員和服務角色可讀取客戶資料" ON customers;

-- Create a more secure read policy that only allows authenticated admins
CREATE POLICY "僅認證管理員可讀取客戶敏感資料" 
ON customers FOR SELECT 
USING (is_authenticated_admin());

-- Keep service role access for write operations (INSERT, UPDATE, DELETE) 
-- as these might be needed for legitimate data migration and sync operations
-- but are less risky than exposing read access to sensitive personal data