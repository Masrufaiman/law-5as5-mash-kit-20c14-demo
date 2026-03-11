

# Plan: Fix Drag-and-Drop, Step Counter 100% Completion, Prompt State Persistence, and Response Quality

## Issues Identified

### 1. Drag-and-drop file upload broken in prompt box
**Root cause:** In `ChatInput.tsx` line 240, the `onDrop` handler tries to find the hidden file input via `e.currentTarget.closest('.mx-auto')?.querySelector('input[type="file"]')`. But the hidden `<input type="file">` is *outside* the `ChatInput` component — it's in `Chat.tsx` line 956, wrapped in a `div.mx-auto`. The `e.currentTarget` inside ChatInput is the prompt box div, and `.closest('.mx-auto')` may not find the parent because the input is a sibling, not a child of ChatInput.

**Fix:** Instead of DOM traversal, pass a new `onFilesDropped` prop from `Chat.tsx` that directly calls `handleFilesSelected(files)`. The `ChatInput` drop handler calls `onFilesDropped(files)` instead of trying to manipulate a hidden input.

### 2. Step counter never reaches 100% (4/6, 7/9, 5/7, 3/4)
**Root cause:** The progress counter at line 870-871 emits `current: iteration, total: Math.max(iteration, currentPlan.length)`. After the loop ends, line 973 emits `current: currentPlan.length, total: currentPlan.length` — but only if the stream reaches that point. The issue is that `currentPlan.length` may be 6 but the loop exits after 4 iterations because the inner monologue returns `FINISH`. The final progress at line 973 does emit `plan.length/plan.length`, but this happens just before synthesis starts, and the UI may not update it because the `StepTracker` only shows progress when `isWorking` is true (line 157).

**Fix in `llm-router`:** After the loop ends, always emit the final progress as `total/total` AND ensure it's emitted before the "done" event. Also in `StepTracker.tsx`, show the final progress count even when `!isWorking` briefly, or ensure the collapsed summary shows "Completed in X steps" where X = plan length, not just completed step count.

**Fix in `StepTracker.tsx`:** When all steps are done and not streaming, the `completedCount` (line 65) counts steps with `status === "done"`, but the plan may have more items than executed steps. Change the collapsed summary to use `totalSteps` (plan length) instead of `completedCount` when a plan exists.

### 3. AI says "I cannot access external documents or files from your vault" (screenshot)
**Root cause:** The user attached 3 DOCX files (LP4, LP5, LP6 SideLetters) and asked for "red line analysis". The files were uploaded to the "Uploads" vault and file IDs were tracked in `conversationAttachedFileIds`. However, the `processAttachedFiles` function triggers `document-processor` as fire-and-forget (line 197), and the AI query is sent immediately. By the time the llm-router does `vault_search`, the documents may not be fully processed (OCR/embedding takes time). The vault search finds nothing, and the AI falls back to saying it can't access the files.

**Fix:** This is a timing/pipeline issue. Add a brief polling step in `handleSend` or `processAttachedFiles` to wait until attached files have `status: 'ready'` before sending the message. Or, in the `llm-router`, when `attachedFileIds` are provided, check file status and wait/retry if still processing. The simpler frontend fix: after `processAttachedFiles`, poll file status until ready (with a timeout), showing the rotating status messages.

### 4. Prompt box state lost on reload
**Root cause:** `activeSources`, `deepResearch`, `promptMode`, `selectedVault`, `workflowTag`, `input`, and `attachedFiles` are all `useState` with no persistence. On reload, they reset to defaults.

**Fix:** Save these values to `sessionStorage` keyed by `conversationId`. On load, restore them. File objects can't be serialized, but their names can be stored for display. The actual file IDs are already tracked in `conversationAttachedFileIds`.

### 5. Markdown table rendering broken mid-table
The table preprocessing regex on line 351 of `MessageBubble.tsx` handles simple cases but breaks when tables have content immediately before/after without double newlines. The current regex `([^\n])\n(\|)` only catches single-char before newline. Need to also handle the case where the separator row `|---|---|` needs blank lines.

**Fix:** Improve the regex to be more aggressive about ensuring blank lines around complete table blocks.

## File Changes

| File | Changes |
|------|---------|
| `src/components/chat/ChatInput.tsx` | Add `onFilesDropped` prop; update `onDrop` to call it directly instead of DOM traversal |
| `src/pages/Chat.tsx` | Pass `onFilesDropped={handleFilesSelected}` to ChatInput; add sessionStorage persistence for prompt state; add file status polling before sending message |
| `src/components/chat/StepTracker.tsx` | Fix collapsed summary to use plan length as completed count; ensure final progress shows even briefly after loop |
| `src/components/chat/MessageBubble.tsx` | Improve table preprocessing regex for more robust blank-line insertion |
| `supabase/functions/llm-router/index.ts` | Ensure final progress emitted as total/total; add file readiness check when attachedFileIds provided |

