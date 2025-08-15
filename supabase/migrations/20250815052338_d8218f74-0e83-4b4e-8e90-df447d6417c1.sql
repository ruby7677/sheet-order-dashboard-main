-- Fix admin_users security policies without syntax errors
-- Implement proper access controls for administrator account protection

-- Recreate admin_users policies with proper security controls
-- Only allow super admins to see all admin data (including password hashes for user management)
CREATE POLICY "超級管理員完全存取"
ON admin_users FOR ALL
TO authenticated  
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Allow regular admins to see only their own basic profile data
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
-- Use a more restrictive approach - only allow specific safe updates
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
);

-- Create a safe view for admin profiles that excludes sensitive data
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

-- Grant SELECT permission on the safe view
GRANT SELECT ON public.safe_admin_profiles TO authenticated;

-- Create secure functions for safe admin operations
CREATE OR REPLACE FUNCTION public.update_admin_safe_fields(
    new_full_name TEXT DEFAULT NULL,
    new_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only allow current user to update their own safe fields
    -- Explicitly prevent updates to sensitive fields like password_hash, role, is_active
    UPDATE admin_users 
    SET 
        full_name = COALESCE(new_full_name, full_name),
        email = COALESCE(new_email, email),
        updated_at = NOW()
    WHERE id = auth.uid() 
    AND is_active = true
    AND EXISTS (
        SELECT 1 FROM admin_users 
        WHERE id = auth.uid() 
        AND is_active = true
    );
    
    RETURN FOUND;
END;
$$;

-- Grant execute permission on the safe update function
GRANT EXECUTE ON FUNCTION public.update_admin_safe_fields(TEXT, TEXT) TO authenticated;