-- Create conversation_shares table for email-based sharing
CREATE TABLE public.conversation_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL,
  shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  permission text NOT NULL DEFAULT 'view',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, shared_with_email)
);

ALTER TABLE public.conversation_shares ENABLE ROW LEVEL SECURITY;

-- Users can create shares for conversations in their org
CREATE POLICY "Users can create conversation shares"
ON public.conversation_shares FOR INSERT TO authenticated
WITH CHECK (
  shared_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_shares.conversation_id
    AND c.organization_id = get_user_org_id()
  )
);

-- Users can view shares they created or that are shared with them
CREATE POLICY "Users can view conversation shares"
ON public.conversation_shares FOR SELECT TO authenticated
USING (
  shared_by = auth.uid()
  OR shared_with_email = (SELECT email FROM profiles WHERE id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = conversation_shares.conversation_id
    AND c.organization_id = get_user_org_id()
    AND is_org_admin(auth.uid())
  )
);

-- Users can delete shares they created
CREATE POLICY "Users can delete conversation shares"
ON public.conversation_shares FOR DELETE TO authenticated
USING (shared_by = auth.uid());

-- Allow conversations SELECT for shared users
CREATE POLICY "Shared users can view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_shares cs
    WHERE cs.conversation_id = conversations.id
    AND cs.shared_with_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);

-- Allow messages SELECT for shared conversations
CREATE POLICY "Shared users can view messages"
ON public.messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_shares cs
    WHERE cs.conversation_id = messages.conversation_id
    AND cs.shared_with_email = (SELECT email FROM profiles WHERE id = auth.uid())
  )
);

-- Add UPDATE policy on messages for metadata updates
CREATE POLICY "Users can update messages in their org"
ON public.messages FOR UPDATE TO authenticated
USING (organization_id = get_user_org_id())
WITH CHECK (organization_id = get_user_org_id());