-- Fix function search path security warnings
ALTER FUNCTION public.is_service_role_request() SET search_path = '';
ALTER FUNCTION public.is_authenticated_admin() SET search_path = '';