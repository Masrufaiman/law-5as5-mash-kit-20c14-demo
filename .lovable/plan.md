
Goal: fix the still-reproducible red-flag failure for DOCX files and restore prompt chips + editor reopening after reload.

What I verified
- `document-processor` is still failing DOCX extraction in production logs with:
  `DecompressionStream("raw") is not valid` (must be `deflate`).
- The failing file (`LP5_SideLetter_MeridianCapital.docx`) is in `files` with `status=error`, `text_len=0`, `chunk_count=0`.
- In the latest affected conversation (`bac2b7e9-...`), only assistant “Document Not Ready” messages are saved; user messages are missing entirely.
- Because reload hydration relies on latest user message metadata, chips (mode/vault/uploads) disappear after refresh.
- Red-flag editor targeting can pick wrong file after reload because fallback currently degrades to first `frozenFileRef`.

Implementation plan

1) Fix DOCX extraction runtime bug (root blocker)
- File: `supabase/functions/document-processor/index.ts`
- Replace invalid `new DecompressionStream("raw")` with `new DecompressionStream("deflate")`.
- Keep current ZIP/XML path, but harden error reporting so extraction failures always persist clear `error_message`.
- Preserve current behavior: empty extraction => `status="error"` (never `ready` with empty text).

2) Ensure user message metadata is always persisted (even on early “Document Not Ready” return)
- File: `supabase/functions/llm-router/index.ts`
- Move user-message insert to occur before tool loop/early exits, with full metadata:
  `vaultId, vaultName, promptMode, sources, deepResearch, attachedFileIds, attachedFileNames, workflowTitle`.
- De-duplicate with the later insert path (single insert per user turn).

3) Persist deterministic red-flag file target for reload-safe “Open in Editor”
- File: `supabase/functions/llm-router/index.ts`
- When `read_files` runs, store resolved primary file target (id + name) in assistant metadata (e.g., `redFlagTarget`), including not-ready responses.
- Keep `frozenFileRefs`, but stop relying on first-ref fallback as primary behavior.

4) Strengthen frontend reload hydration and redline open resolution
- Files: `src/pages/Chat.tsx`, `src/components/chat/MessageBubble.tsx`
- In `loadConversation`, restore from user metadata first; if absent (legacy/broken conversations), fallback to assistant metadata (`redFlagTarget` / `frozenFileRefs`) so context chips and file linkage survive.
- Fix storage-key race by reading conversation-specific key (`chat_state_${convId}`) during load.
- Update red-flag open resolution order:
  1. exact `redFlagTarget.id`
  2. strict normalized title match
  3. attached file IDs from restored conversation context
  4. placeholder (last resort)
- Remove blind `refs[0]` preference.

5) Regression-proof checks
- Verify same DOCX now produces non-zero text/chunks (or explicit actionable error if truly unreadable).
- Verify red-flag run after upload no longer loops on “Document Not Ready” for valid DOCX.
- Reload conversation: user prompt chips (mode, vault, upload filename) remain visible.
- Reload + click “Open in Editor” repeatedly opens the correct document each time.

Post-fix recovery for already-broken files
- Existing errored DOCX rows won’t auto-heal; they must be retried/reprocessed (Retry button or re-upload) after the function fix is live.
