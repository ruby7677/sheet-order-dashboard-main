-- 修復 is_authenticated_admin 函數的 search_path 問題
CREATE OR REPLACE FUNCTION public.is_authenticated_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM admin_users 
    WHERE id = auth.uid() 
    AND is_active = true
  );
$function$;

-- 同時修復其他可能有相同問題的函數
CREATE OR REPLACE FUNCTION public.is_service_role_request()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  OR current_setting('request.jwt.sub', true) = 'service-role-user';
$function$;