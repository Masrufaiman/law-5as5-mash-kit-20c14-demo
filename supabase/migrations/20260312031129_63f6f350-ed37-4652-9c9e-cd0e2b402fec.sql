
-- Agent Memory table for persistent context across conversations
CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Users can view their own org's memory entries
CREATE POLICY "Users can view agent memory in their org"
ON public.agent_memory FOR SELECT
TO authenticated
USING (organization_id = get_user_org_id());

-- Users can insert memory for their org
CREATE POLICY "Users can insert agent memory"
ON public.agent_memory FOR INSERT
TO authenticated
WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid());

-- Service role needs full access (edge function uses adminClient)
-- adminClient bypasses RLS, so no additional policy needed

-- Index for fast lookups
CREATE INDEX idx_agent_memory_org_user ON public.agent_memory(organization_id, user_id, created_at DESC);
