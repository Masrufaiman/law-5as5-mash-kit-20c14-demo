

# Plan: 7 Fixes — Collapsible Interference, Home Prompt Box, Deferred Upload, Edit Prompt, Red Flag Fix, Review Table Grounding, Agent Memory

## 1. StepTracker collapsing/expanding when opening sidebar docs

**Root cause:** The `StepTracker` uses a `useEffect` watching `[allDone, isStreaming, hasSteps]`. When the user opens/closes a doc in the right sidebar, the parent `Chat.tsx` calls `setEditorDoc()` or `setSheetDoc()`, which triggers a re-render of the entire message list. The `ResizablePanelGroup` layout change causes `MessageBubble` components to re-mount, resetting `StepTracker`'s internal `collapsed` state and `hasAutoCollapsedRef`. 

**Fix:** Add a stable `key` to each `StepTracker` instance based on the message ID (already done: `key={step-${message.id}}`). The real issue is that `collapsed` state resets. Move the collapsed state management to use the message ID as a key in a `useRef` Map, or better: make the `collapsed` initial state derive from `!isStreaming && allDone` so it doesn't animate on re-renders. Add a guard: if `hasAutoCollapsedRef.current` is already true on mount, start collapsed immediately without animation.

**File:** `src/components/chat/StepTracker.tsx`

## 2. Home page prompt box should use ChatInput component

**Current state:** Home page has its own inline prompt box (duplicated code). Chat page uses `ChatInput` component.

**Fix:** Replace Home's inline prompt box with the `ChatInput` component, passing the same props. This ensures both pages have identical UX. The `ChatInput` component already supports all needed features (sources, modes, vaults, file upload, improve, deep research). Remove the duplicated toolbar code from Home.tsx.

**File:** `src/pages/Home.tsx`

## 3. Defer file upload/OCR/embed until submit

**Current state:** In both Home.tsx and Chat.tsx, when a user selects files, `processAttachedFiles` immediately uploads to R2, inserts into DB, and triggers `document-processor`. This wastes resources if the user removes the file before sending.

**Fix:** 
- On file select: only add to local `attachedFiles` state (File objects). No upload, no toast.
- On submit: then call `processAttachedFiles` → upload → OCR → embed → poll readiness → send message.
- Remove the "1 file uploaded" toast that fires on selection.
- In Home.tsx: the current flow already defers upload to submit time. Just remove the early processing from `handleFilesSelected` in Chat.tsx.

**Files:** `src/pages/Chat.tsx`, `src/pages/Home.tsx`

## 4. Edit prompt system for user messages

**Current state:** `UserMessageActions` has an Edit button but `onEditMessage` is never wired in `Chat.tsx`. The `MessageBubble` doesn't pass `onEdit` to `UserMessageActions`.

**Fix:**
- In `MessageBubble`: wire the `onEdit` callback — when clicked, show an inline textarea replacing the message text, with Save/Cancel buttons.
- In `Chat.tsx`: implement `handleEditMessage` — update the message content in state, delete all messages after it from Supabase and local state, then re-send the edited message.

**Files:** `src/components/chat/MessageBubble.tsx`, `src/pages/Chat.tsx`

## 5. Red flag mode ignoring attached files (AI asks "which document?")

**Root cause:** The `hasVault` check on line 692: `const hasVault = !!(attachedFileIds?.length) || !!(vaultId && !isUploadsVaultEarly)`. When `attachedFileIds` is provided, `hasVault` is true. But in `toolReadFiles` (line 218), when `attachedFileIds?.length` is true, it does `fileQuery.in("id", attachedFileIds)` which is correct. The issue is that the file may still be `status: "processing"` when the AI tries to read it — `extracted_text` is null, so `toolReadFiles` returns "No documents found".

**Fix:** 
- In `toolReadFiles`: if `attachedFileIds` is provided but no files with `extracted_text` are found, poll up to 30 seconds for files to become ready.
- Also: the inner monologue sometimes overrides `nextTool` even when `attachedFileIds` is present. Add a stronger guard: if `attachedFileIds?.length` is true, the inner monologue cannot choose "ASK" or request clarification about which files to analyze — it must use the attached files.

**File:** `supabase/functions/llm-router/index.ts`

## 6. Review Table system prompt — 4 grounding fixes from audit report

The audit report shows 60% cell fabrication, jurisdiction hallucination, and clause invention. All 4 fixes go in the Review Table system prompt.

**Fix:** Update the `reviewModePrompt` in `llm-router/index.ts` to include:

1. **NOT FOUND logic**: Every cell must include verbatim excerpt. If no verbatim source → `not_found: true`, `confidence: 0.0`. Never infer/estimate.
2. **Governing law grounding**: Only extract from explicit governing law clause. Never infer from LP name/address/currency.
3. **Document type awareness**: LP side letters don't contain liability caps, auto-renewal, termination notice periods. If asked → NOT FOUND.
4. **Payment term precision**: Extract each sub-value separately (mgmt fee, carry, hurdle). Only from verbatim text.

Also update `SheetEditor.tsx` cell rendering: when `cell.not_found === true` (or value contains "NOT FOUND"), render gray italic instead of red.

**Files:** `supabase/functions/llm-router/index.ts`, `src/components/editor/SheetEditor.tsx`

## 7. Agent memory/context system

**Current state:** The agent loads org context, knowledge base, vault inventory, and last conversation history. But it has no persistent memory across conversations.

**Fix:** Create a lightweight `agent_memory` table to store concise context notes the agent generates after each conversation. On each new request, load the last 10 memory entries as additional context.

- New migration: `agent_memory` table (id, organization_id, user_id, content, category, created_at) with RLS
- In `llm-router`: after final synthesis, generate a 2-sentence memory summary and save it
- On each new request: load last 10 memory entries and prepend to system prompt as `## Agent Memory`

**Files:** migration SQL, `supabase/functions/llm-router/index.ts`

## Implementation order

1. StepTracker collapse fix
2. Home prompt box → ChatInput  
3. Defer file upload to submit
4. Edit prompt system
5. Red flag file access fix + review table grounding
6. Agent memory system

## File changes summary

| File | Changes |
|------|---------|
| `src/components/chat/StepTracker.tsx` | Fix collapsed state persistence across re-renders |
| `src/pages/Home.tsx` | Replace inline prompt box with ChatInput component |
| `src/pages/Chat.tsx` | Defer file processing to submit; implement edit message |
| `src/components/chat/MessageBubble.tsx` | Add inline edit UI for user messages |
| `supabase/functions/llm-router/index.ts` | File polling in toolReadFiles; review table grounding prompt; agent memory |
| `src/components/editor/SheetEditor.tsx` | Gray italic for NOT FOUND cells |
| Migration SQL | `agent_memory` table |

