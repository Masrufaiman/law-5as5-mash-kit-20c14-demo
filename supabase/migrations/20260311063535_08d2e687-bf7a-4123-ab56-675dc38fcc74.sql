
-- 1. Fix INSERT on profiles: restrict role to 'member' for new signups
DROP POLICY IF EXISTS "Allow profile creation" ON public.profiles;
CREATE POLICY "Allow profile creation"
ON public.profiles
FOR INSERT
TO public
WITH CHECK (id = auth.uid() AND role = 'member');

-- 2. Restrict llm_configs SELECT to admins only (key material protection)
DROP POLICY IF EXISTS "Users can view their org's LLM configs" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their org's LLM configs" ON public.llm_configs;
CREATE POLICY "Users can view their org's LLM configs"
ON public.llm_configs
FOR SELECT
TO public
USING ((organization_id = get_user_org_id() AND is_org_admin(auth.uid())) OR (organization_id IS NULL) OR is_superadmin(auth.uid()));
