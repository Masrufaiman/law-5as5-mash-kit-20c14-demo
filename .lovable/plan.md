

# Plan: Fix 10 Issues — Red Flags, File Access, Uploads Vault, Drafting Notes, Streaming, Status Column, Config Tags

## Issues Analysis

### 1. Red Flag mode returns "please specify which document" instead of analyzing
**Root cause:** The AI sees documents in vault but the `context_preview` in self-check or the inner monologue decides it needs clarification. The real problem: when `effectiveMode === "red_flags"`, the red flag prompt is only applied at synthesis time (line 988). During the ReAct loop, the inner monologue doesn't know it's in red flag mode and decides to ask for clarification instead of just reading and analyzing the documents. Also, the `read_files` tool is only called when the inner monologue requests it — it's not forced for red_flag mode.

**Fix:** When mode is `red_flags` and `hasVault`, force a `read_files` call as the first tool action (before vault_search). This ensures the AI has the full document content before the inner monologue runs.

### 2. Source files not clickable / not opening in right sidebar
**Already wired:** `CollapsibleReferences` passes `onFileClick` and `handleFileClick` does fuzzy matching. The issue is that citations from web sources have URLs (opens in tab) but vault file citations need the `onFileClick` callback. Check that `onFileClick` is passed from Chat.tsx all the way through. It is — `onFileClick={handleFileClick}` at line 964. This should work. May need to verify at runtime.

### 3. "Uploads" vault not accessible from Vault page
**Root cause:** The Uploads vault is created programmatically in `processAttachedFiles` when files are uploaded via the prompt box. It shows up in the vault list but the user expects to see it and manage files there. The vault IS accessible — it shows in the list. But the user may be confused because it has a generic name. No code change needed — it already appears in the vault grid. The user may not have uploaded files yet in this session.

**Actually:** Looking at the vault page code, it loads vaults where `organization_id` matches. The Uploads vault is created with the org ID, so it will show up. No fix needed — it already works.

### 4. AI can't access attached files (Image 2: "check this contract" → asks which contract)
**Root cause:** Line 688: `const hasVault = !!(attachedFileIds?.length) || !!(vaultId && !isUploadsVaultEarly)`. When user attaches a file AND selects Uploads vault, `isUploadsVaultEarly` is true and `attachedFileIds` may be passed. But in `handleSend` (line 491-511), when there's no pre-existing conversation, it calls `createConversationAndSend` without `attachedFileIds`. When `conversationAttachedFileIds` has values from a previous upload in this session, they're passed on line 507 only if `vaultName === "Uploads"`. But `vaultName` may not be set if user just attached a file without explicitly selecting a vault.

The real issue: In `handleSend` (line 491), when creating a new conversation, it calls `createConversationAndSend(msg, vaultId, deepResearch, activeSources, promptMode)` without passing `attachedFileIds`. The file IDs from `conversationAttachedFileIds` are only passed in the `else` branch (line 506-508) for existing conversations.

**Fix:** In `handleSend`, when `!conversationId` and `conversationAttachedFileIds.length > 0`, pass the file IDs to `createConversationAndSend`. Also pass `attachedFileNames`.

### 5. Drafting Notes appearing in the document editor instead of the chat response
**Root cause:** When the AI generates a document with `# Title` followed by content including `## Drafting Notes`, the entire response (including Drafting Notes) is detected as a single document by `detectDocuments()`. This means the full content (with Drafting Notes) gets passed to `handleDocumentOpen` and rendered in the editor. The chat bubble only shows a compact card.

**Fix:** In `detectDocuments`, strip the `## Drafting Notes` section from the document content. Keep it as separate text to show in the chat response below the card.

### 6. Doc/review table/drafting should stream to right sidebar, not chat
**Current behavior:** Documents are detected only after streaming completes (`!isStreaming`), then shown as a card. During streaming, raw markdown appears in the chat.

**Fix:** This is a significant architecture change. For now, the practical fix: during streaming in drafting/review mode, show a skeleton/loading state in the chat bubble instead of raw content, and auto-open the right panel once content is detected. Detect doc/sheet patterns during streaming and open the sidebar early.

### 7. Sheet JSON showing raw in chat (Image 5)
**Root cause:** The `<!-- SHEET: ... -->` block with JSON is detected by `detectSheets()` only when `!isStreaming`. During streaming, the raw JSON is displayed as chat content. After streaming completes, it should render as a card.

**Fix:** During streaming, if the content starts with `<!-- SHEET:` or contains the sheet marker, hide the raw content and show a "Generating review table..." skeleton. Same for `<!-- REDFLAGS:`.

### 8. Remove 'AI Auto-fill' from Add Column dialog
**Fix:** Remove the AI Auto-fill switch from `ColumnBuilderDialog`. Always default to `ai` fill mode internally.

### 9. Remove default Status column from review table
**Root cause:** In `SheetEditor.tsx` line 397-399, there's a hardcoded "Status" column in the table header and lines 458-465 render a Status badge for each row.

**Fix:** Remove the Status column header and cell rendering from SheetEditor.

### 10. Show Home page configs as tags on first message in conversation
**Root cause:** When navigating from Home, the state (promptMode, vault, sources, deepResearch, workflow) is passed via `location.state` but not stored on the user message. The `AttachmentBadges` component only shows `vaultName` and `fileNames`.

**Fix:** Store the full config (promptMode, sources, deepResearch, workflowTag) in the message's `attachments` field and render them as badges on the first user message.

## File Changes

### `src/pages/Chat.tsx`
- **Fix #4:** In `handleSend` when `!conversationId`, pass `conversationAttachedFileIds` and file names to `createConversationAndSend`
- **Fix #10:** When sending first message from Home, include configs in message attachments

### `src/components/chat/MessageBubble.tsx`
- **Fix #5:** Split document detection to separate Drafting Notes from document body, show notes in chat below the card
- **Fix #7:** During streaming, detect sheet/redflags markers and show skeleton instead of raw JSON/markdown
- **Fix #10:** Update `AttachmentBadges` to render mode, sources, deepResearch, workflow badges

### `src/components/editor/SheetEditor.tsx`
- **Fix #8:** Remove AI Auto-fill toggle from `ColumnBuilderDialog`
- **Fix #9:** Remove Status column header and cells from the table

### `supabase/functions/llm-router/index.ts`
- **Fix #1:** When mode is `red_flags` and `hasVault`, force `read_files` as the first tool action before the ReAct loop starts

