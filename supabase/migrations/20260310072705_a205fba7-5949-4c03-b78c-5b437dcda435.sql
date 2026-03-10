
-- Fix infinite recursion: create a security definer function to check shared access
CREATE OR REPLACE FUNCTION public.is_conversation_shared_with_user(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_shares cs
    JOIN profiles p ON p.id = _user_id
    WHERE cs.conversation_id = _conversation_id
    AND cs.shared_with_email = p.email
  )
$$;

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Shared users can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Shared users can view messages" ON public.messages;

-- Recreate with security definer function (no recursion)
CREATE POLICY "Shared users can view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_shared_with_user(id, auth.uid()));

CREATE POLICY "Shared users can view messages"
ON public.messages FOR SELECT TO authenticated
USING (public.is_conversation_shared_with_user(conversation_id, auth.uid()));

-- Also fix conversation_shares SELECT policy to avoid recursion
DROP POLICY IF EXISTS "Users can view conversation shares" ON public.conversation_shares;
CREATE POLICY "Users can view conversation shares"
ON public.conversation_shares FOR SELECT TO authenticated
USING (
  shared_by = auth.uid()
  OR shared_with_email = (SELECT email FROM profiles WHERE id = auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_shares.conversation_id
      AND c.organization_id = get_user_org_id()
    )
    AND is_org_admin(auth.uid())
  )
);
