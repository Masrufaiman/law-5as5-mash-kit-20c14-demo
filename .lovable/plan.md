

# Plan: 6 Red Flag Mode Fixes

## Problem Summary

From the screenshots: (1) right panel shows raw JSON instead of the document, (2) AI analyzed wrong document, (3) risk score shows "20/10", (4) summary paragraph duplicated, (5) jurisdiction flag fires inappropriately, (6) step label says "Reading vault documents" for attached files.

## Fix 1 — Right panel shows raw JSON instead of document

**Root cause:** Line 600 in `MessageBubble.tsx`:
```
onOpenInEditor(redFlagData.title, cleanContent)
```
This passes the entire chat response (including the `<!-- REDFLAGS: ... -->` JSON block) as the editor content. The editor then renders the raw JSON.

**Fix:** When "Open in Editor" is clicked for red flags, fetch the actual uploaded document's `extracted_text` from the database instead of passing the chat response. Change `onOpenInEditor` to call `onFileClick` with the document name. If `onFileClick` is not available, strip the REDFLAGS JSON block from the content before passing to the editor.

**File:** `src/components/chat/MessageBubble.tsx` (line 598-601)

## Fix 2 — Wrong document analyzed

**Root cause:** The step log shows "Reading vault documents — 33s" which means `toolReadFiles` ran with `vaultId` scope (entire Uploads vault) instead of `attachedFileIds`. The force-finish guard (line 933) only works if `attachedFileIds` is set. The issue is that `attachedFileIds` may not have been passed because the files were uploaded in a previous conversation turn — the IDs were stored in `conversationAttachedFileIds` state but only sent when `vaultName === "Uploads"` (line 517).

**Fix:** In the red flag prompt, add: "You MUST analyze ONLY the document content provided in the '## Document Contents' section. Do not reference any other documents from memory, training data, or previous sessions. If the document content references parties or terms, use ONLY those exact details."

Also: the step label `"Reading vault documents"` should be `"Reading attached document"` when `attachedFileIds` is present.

**File:** `supabase/functions/llm-router/index.ts` (line 872, 1071-1107)

## Fix 3 — Risk score "20/10"

**Root cause:** The LLM generates `risk_score: 20` in the JSON (likely summing individual flag scores). The prompt says `risk_score: N` without specifying the range.

**Fix:** 
- In the red flag prompt: add `"risk_score": N  // overall risk 0-10, NOT a sum of individual flags`
- In `RedFlagCard.tsx`: cap the displayed score at 10: `Math.min(summary.risk_score, 10)`

**Files:** `supabase/functions/llm-router/index.ts` (line 1094), `src/components/chat/RedFlagCard.tsx`

## Fix 4 — Duplicate summary paragraph

**Root cause:** The red flag prompt says "Before the REDFLAGS block, write a brief 2-3 sentence overview" AND "After the REDFLAGS block, write a brief conclusion." The LLM sometimes writes the same overview both before and after. The `remainingContent` regex strips the JSON block but leaves both text blocks.

**Fix:** Change the prompt: remove "After the REDFLAGS block, write a brief conclusion." Instead: "Write a brief 2-3 sentence overview BEFORE the REDFLAGS block. Do NOT repeat this overview after the block. After the block, write only key recommendations (different from the overview)."

**File:** `supabase/functions/llm-router/index.ts` (line 1105-1107)

## Fix 5 — Jurisdiction flag context-awareness

**Fix:** Add to red flag prompt: "Only flag governing law as a risk if the jurisdiction is clearly mismatched with the parties' stated locations, or if the jurisdiction is unusual for the contract type. Do NOT flag a jurisdiction simply because it differs from England and Wales — assess based on the parties involved."

**File:** `supabase/functions/llm-router/index.ts`

## Fix 6 — Step label for attached files

**Fix:** Line 872: when `attachedFileIds?.length`, use label "Reading attached document" instead of "Reading vault documents".

**File:** `supabase/functions/llm-router/index.ts` (line 869-873)

## File Changes Summary

| File | Changes |
|------|---------|
| `src/components/chat/MessageBubble.tsx` | Fix red flag "Open in Editor" to use `onFileClick` for actual document; fall back to stripping JSON |
| `src/components/chat/RedFlagCard.tsx` | Cap risk score display at 10 |
| `supabase/functions/llm-router/index.ts` | Step label fix; red flag prompt: specify risk_score range, remove duplicate summary instruction, add jurisdiction context rule, add grounding instruction |

