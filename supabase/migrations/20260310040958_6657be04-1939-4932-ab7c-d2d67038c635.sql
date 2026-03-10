
-- Create message_feedback table
CREATE TABLE public.message_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  feedback text NOT NULL CHECK (feedback IN ('up', 'down')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert/update their own feedback
CREATE POLICY "Users can insert feedback" ON public.message_feedback
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "Users can update their feedback" ON public.message_feedback
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their feedback" ON public.message_feedback
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback" ON public.message_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all feedback in their org
CREATE POLICY "Admins can view org feedback" ON public.message_feedback
  FOR SELECT TO authenticated
  USING (organization_id = get_user_org_id() AND is_org_admin(auth.uid()));
