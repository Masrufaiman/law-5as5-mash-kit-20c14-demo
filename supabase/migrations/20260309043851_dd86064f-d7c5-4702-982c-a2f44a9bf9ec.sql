
DROP POLICY IF EXISTS "Allow org creation during signup" ON public.organizations;

-- Policy applies even if request role falls back to public, but still requires an authenticated JWT.
CREATE POLICY "Allow org creation during signup"
  ON public.organizations
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL);
