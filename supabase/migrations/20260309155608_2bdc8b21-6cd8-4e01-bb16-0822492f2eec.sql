
-- Add file processing columns to files table
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS ocr_used boolean DEFAULT false;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS chunk_count integer;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS extracted_text_r2_key text;

-- Add Qdrant and position columns to file_chunks table
ALTER TABLE public.file_chunks ADD COLUMN IF NOT EXISTS qdrant_point_id text;
ALTER TABLE public.file_chunks ADD COLUMN IF NOT EXISTS char_start integer;
ALTER TABLE public.file_chunks ADD COLUMN IF NOT EXISTS char_end integer;
