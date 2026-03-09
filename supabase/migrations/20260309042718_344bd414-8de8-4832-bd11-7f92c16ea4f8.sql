
DROP POLICY IF EXISTS "Allow org creation during signup" ON public.organizations;
CREATE POLICY "Allow org creation during signup"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
