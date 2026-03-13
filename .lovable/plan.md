
Goal: fix the red-flag mode failures shown in your screenshots and restore prompt context chips after reload.

1) Root causes confirmed
- Red-flag analysis can still generate flags even when `read_files` finds no text (hallucination path still possible for vault mode).
- DOCX extraction in `document-processor` is fundamentally broken (`extractDocxText` regexes zipped binary), causing `status=ready` with `extracted_text=""` and `chunk_count=0`.
- “Open in Editor” depends on `frozenFileRefs`; after reload those are often missing, so click does nothing.
- User prompt chips (vault/mode/sources/file names) disappear after reload because user-message metadata is not persisted and `loadConversation` does not reconstruct `attachments`.

2) Implementation plan

A. Stop red-flag hallucinations + improve file-read reliability
- File: `supabase/functions/llm-router/index.ts`
  - Upgrade `toolReadFiles` to:
    - fallback to `file_chunks` when `extracted_text` is empty,
    - return candidate `fileRefs` even if text is unavailable,
    - classify empty result reason (`processing`, `error`, `ready_but_empty`).
  - Add a hard guard for `effectiveMode === "red_flags"`:
    - if no grounded text context, return explicit status message and do not synthesize red flags.

B. Fix DOCX extraction pipeline
- File: `supabase/functions/document-processor/index.ts`
  - Replace binary-regex DOCX extraction with proper DOCX ZIP/XML parsing.
  - If extraction remains empty, set `status="error"` with `error_message` (do not mark `ready` with empty text).
  - Keep existing Mistral OCR settings already required (`table_format: "html"`, `include_image_base64: true`) unchanged.

C. Make “Open in Editor” work after reload
- Files: `src/components/chat/MessageBubble.tsx`, `src/pages/Chat.tsx`
  - In red-flag card actions:
    - pick file ref by matching `redFlagData.title` first, not always `refs[0]`,
    - fallback to opening by title when refs are missing.
  - In `openRedFlagPanel`, add title+ID-first resolution with fallback to last known attached file context.

D. Persist and restore user prompt context chips
- Files: `supabase/functions/llm-router/index.ts`, `src/hooks/useStreamChat.ts`, `src/pages/Chat.tsx`
  - Persist user-message metadata on every user insert:
    - `vaultId`, `vaultName`, `promptMode`, `sources`, `deepResearch`, `attachedFileIds`, `attachedFileNames`, `workflowTitle`.
  - Map this metadata back into `message.attachments` in `loadConversation`.
  - Restore current prompt UI state from latest user metadata when localStorage is missing/stale.
  - Ensure `selectedVault` object is set during conversation load (not only `vaultId/vaultName`).

3) Technical scope (files)
- `supabase/functions/document-processor/index.ts`
- `supabase/functions/llm-router/index.ts`
- `src/hooks/useStreamChat.ts`
- `src/pages/Chat.tsx`
- `src/components/chat/MessageBubble.tsx`
- `src/components/chat/RedFlagCard.tsx` (only if needed for callback payload tightening)

4) Acceptance checks
- Reload conversation → user message shows selected vault, mode, sources, and uploaded file names.
- Reload + click “Open in Editor” on a red-flag card → right panel opens consistently.
- Red-flag mode with unavailable/empty docs → clear “cannot analyze yet” message, zero fabricated flags.
- Red-flag mode with valid docs → right panel opens with matched file and redline actions work.
