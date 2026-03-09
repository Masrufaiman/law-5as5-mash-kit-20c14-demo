

# Fix: R2 Upload Signing, Vault File Processing, User Message UI, and AI Document Access

## Root Cause Analysis

### R2 Upload Still Failing (403 SignatureDoesNotMatch)
The `r2-upload` function constructs the PUT URL with the raw `r2Key` (which contains filenames with spaces/parens like `5482099092 (1).pdf`). When `new URL(url)` parses this, the browser auto-encodes spaces to `%20`. Then `signedR2Request` calls `decodeURIComponent(pathname)` and re-encodes with `uriEncode()`. This double-encoding causes a mismatch. The fix: URI-encode each path segment of `r2Key` before building the URL, same as document-processor.

### AI Cannot Read Vault Files
The entire pipeline is broken:
1. R2 upload fails → file bytes never reach R2
2. Document processor can't download → no text extraction happens
3. Files remain in "processing" status → llm-router filters by `status = "ready"` and finds nothing
4. AI has zero document context → gives garbage answers

Additionally, the fallback path (line 239-255 in llm-router) queries `files.extracted_text` but only gets files with `status = "ready"`. Even if we fix R2, the fallback should also try files in other statuses that have some extracted text.

### Missing UI Features
- User messages don't show vault source or attached files
- No edit/copy buttons on user messages

## File Changes

### `supabase/functions/r2-upload/index.ts`
- URI-encode each segment of `r2Key` before building `putUrl`:
  ```
  const encodedR2Key = r2Key.split("/").map(s => encodeURIComponent(s)).join("/");
  const putUrl = `${endpoint}/${config.bucket_name}/${encodedR2Key}`;
  ```

### `supabase/functions/llm-router/index.ts`
- **Vault fallback**: Remove the `.eq("status", "ready")` filter on the fallback query so files with any extracted_text are included even if status is "processing" or "error"
- **Include ALL vault files when no vaultId specified but user asks about "all files"**: When user message mentions "all files" or "analyzing all files", load files across all vaults for the org
- **Pass vault name and file names in context**: Include vault name and attached file names so the AI references them properly

### `src/hooks/useStreamChat.ts`
- Add `attachments` field to `ChatMessage` to store vault info and file references for display
- Pass vault name and attached file metadata when creating user messages

### `src/components/chat/MessageBubble.tsx`
- **User messages**: Show vault badge and attached file chips below user text
- **User message actions**: Add Edit (pencil) and Copy icons that appear on hover, similar to ResponseActions

### `src/pages/Chat.tsx`
- Pass vault name and file info through to user messages so they render in the bubble
- Store `vaultName` state alongside `vaultId`

### `src/pages/Vault.tsx`
- Sanitize `r2Key`: replace spaces with underscores in filename to avoid encoding issues entirely

## Summary

| File | Change |
|------|--------|
| `r2-upload/index.ts` | URI-encode r2Key path segments before building URL |
| `llm-router/index.ts` | Remove status filter on vault fallback, include all org files when asked |
| `useStreamChat.ts` | Add attachments metadata to ChatMessage |
| `MessageBubble.tsx` | Show vault/file badges on user messages, add edit/copy actions |
| `Chat.tsx` | Pass vault name to user messages |
| `Vault.tsx` | Sanitize filenames in r2Key (replace spaces with underscores) |

