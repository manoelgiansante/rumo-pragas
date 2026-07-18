-- Capturado VERBATIM de prod jxcnfyeemdltdfqtgbcl (supabase_migrations.schema_migrations) em 2026-07-18 [CR-05-REST].
-- md5 do corpo verbatim (da linha apos o marcador ate EOF, sem newline final extra) = ab73e20fd50aa7dd133ba5aef62a3c07
--   = md5(array_to_string(statements, E';\n\n')) conferido em prod no momento da captura.
-- >>> corpo verbatim >>>
-- Pragas-only: endurecer bucket pragas-images ENQUANTO vazio (0 objetos, nenhum código o usa)
-- DB-A2 do mega-audit 02/jul. Reversível (recriar policies antigas).

DROP POLICY IF EXISTS "Pragas: Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "Pragas: Authenticated users can upload images" ON storage.objects;

CREATE POLICY "Pragas: owner can view own images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pragas-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Pragas: owner can upload to own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pragas-images' AND (storage.foldername(name))[1] = auth.uid()::text);

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
WHERE id = 'pragas-images';

-- avatars: só limite de tamanho/mime (policies de dono já corretas; bucket público por design)
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
WHERE id = 'avatars' AND file_size_limit IS NULL;