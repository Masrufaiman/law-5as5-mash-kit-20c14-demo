

# Plan: Chat Sharing, Steps Persistence Fix, Upload Vault, Column Add Fix

## Critical Issues Found

### 1. Steps/thinking persistence is BROKEN — Root cause identified
The `useStreamChat.ts` line 308 tries to update `messages` table using `assistantId` (a client-generated UUID), but the DB row is inserted by the **backend** (`llm-router` line 958) with its own `gen_random_uuid()`. The IDs never match. Additionally, the `messages` table has **NO UPDATE RLS policy** — updates are blocked entirely.

**Fix (two-part):**
- **Backend (`llm-router/index.ts`)**: Save the frozen metadata (steps, plan, thinking, followUps) directly in the backend when inserting the assistant message. The backend already has all the data: it has the steps it emitted, the plan, and the follow-ups. Add a `metadata` field to the assistant message insert.
- **Frontend (`useStreamChat.ts`)**: Remove the broken client-side `update` call entirely. The metadata is already being set on the in-memory message object (line 292-303), which is correct for the current session. The DB persistence happens on the backend.
- **Migration**: Add UPDATE policy on messages table so future needs are covered.

### 2. Chat sharing → email-based popup (not public link)
Replace the current `handleShare` (creates public link) with a dialog that accepts multiple emails, inserts into a new `conversation_shares` table, and makes the conversation accessible to those users.

**Files**: `Chat.tsx` (share dialog), new migration for `conversation_shares` table.

### 3. "Prompt Uploads" → "Uploads" default vault
Rename "Prompt Uploads" to "Uploads" in `Chat.tsx` and `Home.tsx`.

### 4. Column add via chat not working
From the images: user asks "Add a column named company name" in chat. The AI generates a new sheet card with 6 columns (including company name), but the data is empty. The issue is that when the AI outputs a new sheet via `<!-- SHEET: -->`, the new column has no values because the AI wasn't given the actual document content to extract from.

The `handleSheetOpen` merges as a new version (line 449), which works. The real fix: when the AI generates a sheet with a new column, the backend needs the file content. The current system prompt should instruct the AI to fill values using the vault/RAG context. This is already handled by the existing RAG pipeline — the issue is that `column_fill` only matches by filename, and filenames may contain truncated UUIDs.

**Fix in `llm-router`**: When generating a sheet update (not column_fill use case), ensure the system prompt instructs filling all column values from the document context.

### 5. Show file processing steps in chat UI
When files are being processed via `processAttachedFiles`, show processing steps (uploading, OCR, embedding) in the StepTracker before the AI response comes back.

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Save metadata (frozenSteps, frozenPlan, frozenThinkingText, followUps) in the assistant message insert |
| `src/hooks/useStreamChat.ts` | Remove broken DB update call; send frozenSteps data in `done` event back to include in metadata |
| `src/pages/Chat.tsx` | Replace share with email dialog; rename "Prompt Uploads" to "Uploads"; show file processing steps |
| `src/pages/Home.tsx` | Rename "Prompt Uploads" to "Uploads" |
| New migration | Add `conversation_shares` table; add UPDATE policy on `messages` for metadata |

## Technical Details

### Backend metadata persistence (llm-router)
The backend already tracks steps via `trackStep()` calls and has follow-ups extracted. Collect the step names, plan items, and follow-ups into a metadata object and include it in the `adminClient.from("messages").insert(...)` call at line 958.

### Conversation sharing
Create `conversation_shares` table with `conversation_id`, `shared_with_email`, `shared_by`, `permission`, `created_at`. Add RLS. Update the conversations SELECT policy to also allow access if the user's email is in `conversation_shares`. The share dialog replaces the current public link approach.

### Column add from chat
The sheet column adding via chat works structurally (new version merges). The missing data is because the AI doesn't have file content in the regular chat flow. Add instruction to the review/sheet system prompt: "When adding columns to an existing sheet, fill all values using the document context provided."

