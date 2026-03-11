
-- Create a security definer function to promote the org creator to admin
-- This bypasses RLS safely since it's server-side
CREATE OR REPLACE FUNCTION public.promote_org_creator(_user_id uuid, _org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only promote if the user is already in the given org and currently a member
  UPDATE public.profiles
  SET role = 'admin', organization_id = _org_id
  WHERE id = _user_id
    AND (organization_id IS NULL OR organization_id = _org_id)
    AND role = 'member';
END;
$$;
