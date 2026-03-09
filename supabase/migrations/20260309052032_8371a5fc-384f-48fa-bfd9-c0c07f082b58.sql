
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Org users can upload vault files'
  ) THEN
    CREATE POLICY "Org users can upload vault files"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'vault-files' AND (storage.foldername(name))[1] = (public.get_user_org_id())::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Org users can delete vault files'
  ) THEN
    CREATE POLICY "Org users can delete vault files"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'vault-files' AND (storage.foldername(name))[1] = (public.get_user_org_id())::text);
  END IF;
END $$;
