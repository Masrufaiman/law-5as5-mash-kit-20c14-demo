CREATE POLICY "Users can delete agent memory" ON public.agent_memory
  FOR DELETE TO authenticated
  USING (organization_id = get_user_org_id() AND user_id = auth.uid());