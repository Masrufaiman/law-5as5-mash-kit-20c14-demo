

# Plan: Fix FOLLOWUP Leak, Vault Fallback, Step Counter, Model Hiding, File Upload in Chat, and Perplexity Setup

## Issues from Screenshots and Feedback

1. **FOLLOWUP text leaking into response body** — The strip regex `>>?FOLLOWUP:` doesn't match plain `FOLLOWUP:` (without `>`). Lines like `FOLLOWUP: Can you search...` remain visible as text before the chips render below.

2. **Vault fallback to web search missing** — When vault returns irrelevant results (invoices for a corporate law query), agent answers from training data instead of automatically falling back to web search. The inner monologue prompt needs a `vault_result_relevant` check.

3. **Step counter stuck at N-1/N** — Progress emits `current: iteration` but loop may exit before iteration reaches `plan.length`. The final progress emit at line 943 should fix this but the counter in StepTracker may not update if the plan length changes mid-stream.

4. **Model names exposed in UI** — Step labels show "Researching sources (sonar-pro)" and "sonar-deep-research". Must hide all model names.

5. **File upload/attach not available on conversation details page** — ChatInput has no `onFilesAttach` prop or UI for attaching files when already in a conversation. Only Home page has file upload.

6. **Sources showing file IDs instead of names** — File chips display UUIDs like `b98af802-7d77-5a29-81c1-758c1acc1316.pdf` because the vault search uses `file_id` as the name when actual file names aren't resolved.

7. **Perplexity API key not wired** — No connector available. Need to connect.

## Changes

### `src/components/chat/MessageBubble.tsx`

**Fix FOLLOWUP stripping (line 345):**
Change `rawContent = rawContent.replace(/>>?FOLLOWUP:\s*.+/g, "").trim();` to also strip plain `FOLLOWUP:` lines:
```
rawContent = rawContent.replace(/^>>?FOLLOWUP:\s*.+$/gm, "").replace(/^FOLLOWUP:\s*.+$/gm, "").trim();
```

### `supabase/functions/llm-router/index.ts`

**1. Hide model names from step labels (line 788):**
Change `Researching sources (${currentSearchModel})` to just `"Researching sources"`. Remove all model name references from user-visible emissions.

**2. Hide model name from emitThinking (line 808):**
Change `Searching across legal databases using ${currentSearchModel}...` to `Searching across legal databases...`

**3. Add vault fallback rule to inner monologue prompt (line 302):**
Add to `INNER_MONOLOGUE_PROMPT`:
```
- VAULT FALLBACK RULE: If vault_search returned empty results, irrelevant results (invoices, receipts, wrong file types), or results unrelated to the query → set next_action to TOOL with next_tool "web_search". NEVER FINISH after irrelevant vault results. Add "vault_result_relevant": false to your JSON.
- Only cite sources that actually contributed to your answer. Never cite vault documents if the answer came from web search or training data.
```

**4. Fix step counter — emit final progress before synthesis (already at line 943, verify it works):**
Also emit progress at the end of the loop with `iteration` count so the counter matches visible steps.

**5. Strip model names from escalation events (line 857):**
Change escalation `to` field from raw model name to human-friendly label: `"Deep Research"` for sonar-deep-research, `"Pro Search"` for sonar-pro, `"Fast Search"` for sonar.

**6. Fix file name resolution in vault search — already correct** (line 206 uses `p.file_name`). The issue is that when files are matched by `file_id` in Qdrant, the payload may store UUIDs. The `toolReadFiles` function (line 231) correctly uses `f.name`. The Qdrant payload uses `p.file_name` which may be the UUID-based filename. Need to look up actual file names from the `files` table when emitting `file_refs`.

### `src/components/chat/ChatInput.tsx`

**Add file attachment support:**
Add `onFilesAttach?: (files: File[]) => void` prop. Add a file input button (paperclip icon) next to Sources in the bottom toolbar. When files are selected, call `onFilesAttach`.

### `src/pages/Chat.tsx`

**Add file attachment handler for conversation details page:**
Add `handleFilesAttach` that processes files via `processAttachedFiles()` and tracks the new file IDs, then sends the message context with the attached files. Pass `onFilesAttach` to `ChatInput`.

### Perplexity API Connection

Connect the Perplexity connector so the API key is available in edge functions.

## File Changes Summary

| File | Changes |
|------|---------|
| `src/components/chat/MessageBubble.tsx` | Fix FOLLOWUP strip regex to catch all formats |
| `supabase/functions/llm-router/index.ts` | Hide model names; add vault fallback rule to monologue; fix source citation accuracy |
| `src/components/chat/ChatInput.tsx` | Add file attachment button and handler |
| `src/pages/Chat.tsx` | Wire file attachment to ChatInput for conversation page |

