-- Fix admin_profiles security issue
-- Remove potentially insecure admin_profiles table/view and consolidate admin data security

-- Check if admin_profiles exists as a table or view and drop it safely
DROP VIEW IF EXISTS public.admin_profiles CASCADE;
DROP TABLE IF EXISTS public.admin_profiles CASCADE;

-- Also drop the potentially problematic safe_admin_profiles view 
-- and replace with secure function approach
DROP VIEW IF EXISTS public.safe_admin_profiles CASCADE;
DROP FUNCTION IF EXISTS public.update_admin_safe_fields(TEXT, TEXT) CASCADE;

-- Create a secure function to get current admin profile safely
-- This replaces the insecure view approach
CREATE OR REPLACE FUNCTION public.get_current_admin_profile()
RETURNS TABLE (
    id uuid,
    username varchar,
    email varchar,
    full_name varchar,
    role varchar,
    is_active boolean,
    last_login timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only return current user's profile data
    -- This ensures users can only see their own data
    RETURN QUERY
    SELECT 
        au.id,
        au.username,
        au.email,
        au.full_name,
        au.role,
        au.is_active,
        au.last_login,
        au.created_at,
        au.updated_at
    FROM admin_users au
    WHERE au.id = auth.uid() 
    AND au.is_active = true;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_admin_profile() TO authenticated;

-- Create secure function for updating safe admin fields
CREATE OR REPLACE FUNCTION public.update_current_admin_profile(
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
    UPDATE admin_users 
    SET 
        full_name = COALESCE(new_full_name, full_name),
        email = COALESCE(new_email, email),
        updated_at = NOW()
    WHERE id = auth.uid() 
    AND is_active = true;
    
    RETURN FOUND;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_current_admin_profile(TEXT, TEXT) TO authenticated;