
-- Create vault_shares table for sharing vaults by email
CREATE TABLE public.vault_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id uuid NOT NULL REFERENCES public.vaults(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add unique constraint to prevent duplicate shares
ALTER TABLE public.vault_shares ADD CONSTRAINT vault_shares_unique UNIQUE (vault_id, shared_with_email);

-- Enable RLS
ALTER TABLE public.vault_shares ENABLE ROW LEVEL SECURITY;

-- Users can view shares for vaults in their org
CREATE POLICY "Users can view vault shares in their org"
ON public.vault_shares
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = vault_shares.vault_id
    AND v.organization_id = get_user_org_id()
  )
  OR shared_with_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

-- Users can create shares for vaults in their org
CREATE POLICY "Users can create vault shares"
ON public.vault_shares
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = vault_shares.vault_id
    AND v.organization_id = get_user_org_id()
  )
  AND shared_by = auth.uid()
);

-- Users can delete shares they created or for their org vaults
CREATE POLICY "Users can delete vault shares"
ON public.vault_shares
FOR DELETE
TO authenticated
USING (
  shared_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.vaults v
    WHERE v.id = vault_shares.vault_id
    AND v.organization_id = get_user_org_id()
    AND is_org_admin(auth.uid())
  )
);
