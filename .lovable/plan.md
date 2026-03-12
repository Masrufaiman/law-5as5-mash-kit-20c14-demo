

# Plan: Fix Legal API Tool Execution + Red Flag Auto-Open + Quality Improvements

Two major problems, 10 sub-issues across backend and frontend.

---

## Problem 1 — Red Flag Document Never Auto-Opens

### Root Cause

The auto-open code at line 432-454 calls `setRedFlagData(rfData)` then `handleFileClick(refs[0].name, refs[0].id)`. `handleFileClick` is async — it queries Supabase for `extracted_text`. Two failure modes:

**A. File not found / no extracted_text**: If the file hasn't finished OCR processing, or name doesn't match, `handleFileClick` silently returns without calling `handleDocumentOpen`. `editorDoc` never gets set. The right panel never opens.

**B. Race condition**: Even when it works, `setRedFlagData` and `setEditorDoc` (inside `handleDocumentOpen`) happen in separate state updates. The right panel renders `RedlineView` only when BOTH `editorDoc && redFlagData` are truthy (line 857).

### Fix

1. **Direct document content injection**: Instead of querying Supabase again (the file was JUST read by the backend), extract the document content from the accumulated context that's already in the assistant message. The backend's `toolReadFiles` loaded the full text — it's in the message metadata or can be fetched from `file_chunks`.

2. **Robust fallback chain in auto-open effect**: 
   - Try `handleFileClick` first (existing flow)
   - If no `extracted_text` found, try fetching from `file_chunks` table (concatenated chunks)
   - If that also fails, set a placeholder: `editorDoc = { title: fileName, content: "Document still processing..." }`
   - Always ensure `editorDoc` gets set so the panel opens

3. **Atomic state update**: Combine `setRedFlagData` and `setEditorDoc` into a single logical operation using a wrapper function that guarantees both are set before render.

### Files Changed

**`src/pages/Chat.tsx`** — Lines 432-454: Rewrite auto-open effect with robust file loading + fallback chain. Add a `openRedFlagPanel` helper that atomically sets both `redFlagData` and `editorDoc`.

---

## Problem 2 — Legal API Tools Execute But Results Are Ignored / Model Says "Search Manually"

The tools ARE wired and DO execute (the tool queue at lines 1212-1250 works). The actual failures are:

### A. EDGAR EFTS endpoint returns unexpected format or 403

The SEC EFTS `search-index` endpoint sometimes blocks cloud IPs or returns non-JSON. The CIK fallback works but only for known companies.

**Fix**: The EDGAR tool code is already solid with 3-tier fallback. The real issue is that when ALL three tiers fail, the tool returns a string saying "no results" but the agent ignores it and says "I cannot access EDGAR." This is a synthesis prompt problem.

**Fix in system prompt**: Add explicit instruction: "If EDGAR was called and returned results (even 0 results), state what was searched and what was found. Never say 'I cannot access EDGAR' — the tool ran. If no filings matched, explain why (e.g., fiscal year mismatch) and suggest alternative queries."

### B. CourtListener retry loop visible in thinking stream

When CourtListener returns errors, the inner monologue keeps suggesting `courtlistener` as `next_tool`, creating 15+ retries visible in thinking.

**Fix**: Add a `courtlistenerAttempts` counter. After 2 failed attempts, blacklist `courtlistener` from the monologue's options and auto-fallback to `web_search` with `site:courtlistener.com` prefix. Cap retry at 2 max.

### C. max_tokens too low — responses truncate mid-table

Line 1657: `max_tokens: effectiveMode === "drafting" ? 16384 : (deepResearch ? 8192 : 4096)`. Regular research gets 4096 which truncates tables.

**Fix**: Change to `effectiveMode === "drafting" ? 16384 : (deepResearch ? 16000 : 8000)`.

### D. "I don't have sufficient information" still appears

Line 926 already bans it in system prompt, but the LLM sometimes ignores this. Need stronger enforcement.

**Fix**: Add post-processing filter in the streaming output. If the first 100 chars of `fullContent` match `/^(I don't|I do not|My internal|Unfortunately,? I)/i`, strip that sentence before emitting tokens. Also add to system prompt: "Your FIRST sentence must directly answer the query or describe what you found. Never open with caveats, disclaimers, or statements about limitations."

### E. Perplexity model selection — sonar used for legal queries

The `selectPerplexityModel` function (lines 99-104) uses complexity score. Simple jurisdiction queries score low and get `sonar` instead of `sonar-pro`.

**Fix**: Any query mentioning a specific jurisdiction, case law, statute, or legal precedent should floor the Perplexity model at `sonar-pro` minimum. Add: `if (/jurisdiction|statute|case law|precedent|v\./i.test(query)) score = Math.max(score, 3)` in `assessComplexity`.

### F. Jurisdiction prefixing not applied to all searches

`prefixSearchQuery` only uses the first jurisdiction. When user selects "Singapore Law" source, the prefix should force Singapore-specific results.

**Fix**: Already works via `JURISDICTION_PREFIX` map and `prefixSearchQuery`. But the sources array uses display names like "Singapore Law" which may not match the map keys. Ensure the source names match the prefix keys.

### G. Citations missing URLs

When Perplexity returns citations, they're captured. But CourtListener and EDGAR citations have URLs already. The issue is the frontend rendering — ensure all citations with URLs render as clickable links.

**Already handled** in `CitationPopover.tsx` — citations with `url` open in new tab. No change needed.

### H. Thinking stream leaking into output

The `<think>` block handling at lines 1704-1729 already strips think blocks. The "thinking" SSE events are separate from tokens. But the `emitThinking` calls at lines 1275, 1285, 1295, 1301, 1309, 1317 emit to the thinking stream — these should NOT appear in the final response.

**Already handled** — `emitThinking` emits `type: "thinking"` events, not `type: "token"` events. The frontend renders these separately. No change needed unless the frontend is mixing them.

---

## Implementation Summary

### File: `src/pages/Chat.tsx`

1. **Rewrite auto-open effect** (lines 432-454): Add robust file content loading with fallback to `file_chunks` table. Use atomic state setter that sets both `redFlagData` and `editorDoc` together.

2. **Add `openRedFlagPanel` helper**: Accepts `RedFlagData` + file name/id, loads content with 3-tier fallback (files table → file_chunks table → placeholder), sets both states.

### File: `supabase/functions/llm-router/index.ts`

1. **Increase max_tokens** (line 1657): Change 4096 → 8000, 8192 → 16000
2. **Add CourtListener retry cap** (line ~1300): Track attempts, blacklist after 2 failures, auto-fallback to web search
3. **Strengthen system prompt** (lines 904-941): Add "First sentence must directly answer", add EDGAR-specific fiscal year knowledge, add known case authorities for common jurisdictions
4. **Fix Perplexity model floor** (line ~87-97): Floor at `sonar-pro` for any jurisdiction-specific or case law query
5. **Add post-processing filter**: Strip "I don't have sufficient information" from first sentence of output before streaming to client

