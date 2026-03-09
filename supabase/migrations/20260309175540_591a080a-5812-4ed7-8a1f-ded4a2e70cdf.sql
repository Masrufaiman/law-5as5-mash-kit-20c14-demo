
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS share_token text UNIQUE;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Allow public access to shared conversations
CREATE POLICY "Anyone can view shared conversations"
ON public.conversations
FOR SELECT
TO anon
USING (is_public = true AND share_token IS NOT NULL);

-- Allow public access to messages of shared conversations
CREATE POLICY "Anyone can view messages of shared conversations"
ON public.messages
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
    AND c.is_public = true
    AND c.share_token IS NOT NULL
  )
);
