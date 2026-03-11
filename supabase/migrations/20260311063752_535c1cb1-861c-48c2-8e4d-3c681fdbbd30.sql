
-- 1. Fix profile UPDATE to prevent org_id hijacking
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  AND (
    organization_id IS NOT DISTINCT FROM (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  )
);

-- 2. Fix llm_configs SELECT: remove NULL org access for non-superadmins
DROP POLICY IF EXISTS "Users can view their org's LLM configs" ON public.llm_configs;
CREATE POLICY "Users can view their org's LLM configs"
ON public.llm_configs
FOR SELECT
TO public
USING (
  (organization_id = get_user_org_id() AND is_org_admin(auth.uid()))
  OR is_superadmin(auth.uid())
);
