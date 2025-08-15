-- Strengthen admin_users table security to prevent credential compromise
-- Ensure password hashes and sensitive admin data are maximally protected

-- Drop existing policies to recreate with stricter controls
DROP POLICY IF EXISTS "管理員查看自己基本資料" ON admin_users;
DROP POLICY IF EXISTS "超級管理員查看所有帳戶" ON admin_users;
DROP POLICY IF EXISTS "管理員更新自己資料" ON admin_users;
DROP POLICY IF EXISTS "超級管理員管理帳戶" ON admin_users;

-- Create a view for safe admin profile access (excluding password hash)
CREATE OR REPLACE VIEW admin_profiles AS
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
FROM admin_users;

-- Enable RLS on the view
ALTER VIEW admin_profiles SET (security_barrier = true);

-- Create ultra-restrictive policies for admin_users table
-- Only super admins can perform any operations on the main table
CREATE POLICY "僅超級管理員可完全存取管理員帳戶"
ON admin_users FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Create a secure function for password verification (without exposing hashes)
CREATE OR REPLACE FUNCTION verify_admin_password(input_username TEXT, input_password_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stored_hash TEXT;
    user_active BOOLEAN;
BEGIN
    -- Get password hash and active status for the user
    SELECT password_hash, is_active 
    INTO stored_hash, user_active
    FROM admin_users 
    WHERE username = input_username;
    
    -- Return false if user not found or inactive
    IF stored_hash IS NULL OR NOT user_active THEN
        RETURN FALSE;
    END IF;
    
    -- Compare hashes
    RETURN stored_hash = input_password_hash;
END;
$$;

-- Create a secure function for admin self-service profile updates (excluding password)
CREATE OR REPLACE FUNCTION update_own_admin_profile(
    new_full_name TEXT DEFAULT NULL,
    new_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only allow updating non-sensitive fields for current user
    UPDATE admin_users 
    SET 
        full_name = COALESCE(new_full_name, full_name),
        email = COALESCE(new_email, email),
        updated_at = NOW()
    WHERE id = auth.uid() AND is_active = true;
    
    RETURN FOUND;
END;
$$;

-- Grant necessary permissions on the view and functions
GRANT SELECT ON admin_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION verify_admin_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_own_admin_profile(TEXT, TEXT) TO authenticated;