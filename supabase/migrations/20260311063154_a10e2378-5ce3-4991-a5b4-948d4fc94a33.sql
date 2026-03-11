
-- 1. Fix privilege escalation: prevent users from changing their own role
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()));

-- 2. Fix audit_logs INSERT policy: restrict to own org and own user_id
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO public
WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid());

-- 3. Restrict api_integrations SELECT to admins only
DROP POLICY IF EXISTS "Users can view integrations in their org" ON public.api_integrations;
CREATE POLICY "Users can view integrations in their org"
ON public.api_integrations
FOR SELECT
TO public
USING (organization_id = get_user_org_id() AND is_org_admin(auth.uid()));
