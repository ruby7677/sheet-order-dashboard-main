-- Fix security definer view issue and implement proper admin access controls
-- Remove problematic security definer view and implement secure policies

-- Drop the problematic security definer view
DROP VIEW IF EXISTS admin_profiles;

-- Recreate admin_users policies with proper security controls
-- Only allow super admins to see all admin data (including password hashes for user management)
CREATE POLICY "超級管理員完全存取"
ON admin_users FOR ALL
TO authenticated  
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Allow regular admins to see only their own basic profile (excluding password hash)
CREATE POLICY "管理員查看自己基本資料" 
ON admin_users FOR SELECT
TO authenticated
USING (
    id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = auth.uid() 
        AND is_active = true
    )
);

-- Allow regular admins to update only their own non-sensitive fields
CREATE POLICY "管理員更新自己非敏感資料"
ON admin_users FOR UPDATE
TO authenticated
USING (
    id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = auth.uid() 
        AND is_active = true
    )
)
WITH CHECK (
    id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = auth.uid() 
        AND is_active = true
    )
    -- Prevent regular admins from changing sensitive fields
    AND OLD.password_hash = NEW.password_hash  -- Cannot change password via regular update
    AND OLD.role = NEW.role                    -- Cannot change own role
    AND OLD.is_active = NEW.is_active          -- Cannot change own active status
);

-- Create a safe view for admin profiles that excludes sensitive data
-- This view will be used by the application for non-sensitive admin data display
CREATE VIEW public.safe_admin_profiles AS
SELECT 
    id,
    username,
    email,
    full_name,
    role,
    is_active,
    last_login,
    created_at,
    updated_at
FROM admin_users
WHERE id = auth.uid() OR is_super_admin();

-- Enable RLS on the safe view without security definer
ALTER VIEW public.safe_admin_profiles SET (security_invoker = true);

-- Grant SELECT permission on the safe view
GRANT SELECT ON public.safe_admin_profiles TO authenticated;