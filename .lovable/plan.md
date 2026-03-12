

# Plan: Fix Legal API Tool Execution + Red Flag Auto-Open + Google Drive Button

Three critical fixes, in priority order.

---

## Fix 1 — Legal API Tools Actually Execute and Return Useful Results

### Root Cause Analysis

The tools ARE wired in the ReAct loop (lines 1109-1211). The `toolQueue` system exists. But several issues cause failure:

**A. EDGAR endpoint URL is wrong.**
The code uses `https://efts.sec.gov/LATEST/search-index` — the correct EDGAR full-text search API is `https://efts.sec.gov/LATEST/search-index?q=...`. This endpoint returns JSON with `hits.hits` format. However, SEC blocks automated requests from cloud IPs without proper User-Agent. The Atom feed fallback also fails silently.

**Fix**: Replace with the correct EFTS endpoint: `https://efts.sec.gov/LATEST/search-index?q=...`. Add a SECOND fallback using the newer `https://efts.sec.gov/LATEST/search-index?q=...&forms=10-K` endpoint. Parse response format correctly based on what SEC actually returns.

**B. CourtListener key may be empty → tool not queued.**
Line 1066: `if (sources?.includes("CourtListener") && courtListenerKey)` — if decryption fails, `courtListenerKey = ""` (falsy), so the tool is never queued even when the user explicitly selects it.

**Fix**: Queue CourtListener even without a key — it supports unauthenticated access with rate limits. Remove `&& courtListenerKey` from the queue condition. The `toolCourtListener` function already handles missing key (line 188: `if (apiKey) headers["Authorization"] = ...`).

**C. EUR-Lex HTML parsing is broken.**
The regex `/<a[^>]*class="title"[^>]*>/` doesn't match EUR-Lex's actual HTML structure. EUR-Lex recently changed their page layout.

**Fix**: Use EUR-Lex's SPARQL/REST endpoint instead of scraping HTML. For known regulations (GDPR, AI Act, MiFID), map names to CELEX numbers and fetch directly. For searches, use the EUR-Lex search API with the `SRD` JSON format.

**D. Tool results may be empty but agent still synthesizes.**
When all three tools return empty context, the agent has no data but proceeds to synthesize, producing a "search manually" response.

**Fix**: Add a system prompt directive: "If CourtListener, EDGAR, or EUR-Lex were called and returned results, you MUST cite and analyze those results. If they returned no results, state that the search returned no matches and suggest alternative queries. NEVER tell the user to search manually."

### Implementation

**File: `supabase/functions/llm-router/index.ts`**

1. Fix `toolEdgar` — use correct EFTS full-text search URL format, parse response correctly, add proper error messages when no results found
2. Fix `toolCourtListener` — remove the `courtListenerKey` requirement from queue condition (line 1066)
3. Fix `toolEurLex` — add known CELEX number map for common regulations, use a more robust parsing approach
4. Add EDGAR-specific knowledge to system prompt (Apple CIK, fiscal year info, etc.)
5. Add tool enforcement: never say "search manually", always report what was found or not found

---

## Fix 2 — Red Flag Right Panel Auto-Opens Automatically

### Root Cause

The auto-open code at lines 432-454 calls `handleFileClick` which queries Supabase by file name/ID. If the file is still processing, or the query doesn't match (e.g. name mismatch), `extracted_text` is null and `editorDoc` never gets set.

### Implementation

**File: `src/pages/Chat.tsx`**

1. **Reliable auto-open**: Instead of depending on `handleFileClick` (which may fail), extract the document text directly from the accumulated context. The `toolReadFiles` already loaded the content into the assistant message. Parse the document content from the last assistant message's metadata or from the SSE stream's `accumulatedContext`.

2. **Direct fallback**: When `handleFileClick` fails (no extracted_text), try loading from `file_chunks` table as concatenated text. If that also fails, show a "Document still processing" message in the right panel.

3. **Remove "Open in Editor" button**: The `onOpenInEditor` prop should still exist but only as a fallback. The auto-open effect handles the primary case.

**File: `src/components/chat/MessageBubble.tsx`**

1. Remove the `onOpenInEditor` button from RedFlagCard rendering (line 601-611). Keep the `onRedFlagOpen` callback for programmatic use.

**File: `src/components/editor/RedlineView.tsx`**

1. Add risk-colored highlighting per the spec (CRITICAL=#FEE2E2, HIGH=#FEF3C7, etc.)
2. Add click-to-scroll sync: when a flag card is clicked in the left panel, emit an event that scrolls the right panel to that clause
3. Add pulse animation on scroll-to
4. Add toolbar with risk counts + Accept All + Export Redlined + View Original

---

## Fix 3 — Google Drive Button in Sources & Vault Upload

### Implementation

**File: `src/components/chat/ChatInput.tsx`**

1. Add a "Google Drive" button in the Sources popover between "Upload files" and "Vaults" section
2. On click, show a toast: "Google Drive integration coming soon — connect your Google account in Settings"
3. When Google API credentials are configured, this button will open the Google Drive Picker

**File: `src/components/vault/VaultDetail.tsx`**

1. Add a "Import from Google Drive" button next to the existing upload button in the vault toolbar
2. Same placeholder behavior until credentials are configured

---

## File Changes Summary

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Fix EDGAR URL & parsing; queue CourtListener without key; fix EUR-Lex; add tool enforcement to system prompt |
| `src/pages/Chat.tsx` | Make red flag auto-open more reliable with direct text extraction fallback |
| `src/components/chat/MessageBubble.tsx` | Remove "Open in Editor" button from RedFlagCard |
| `src/components/editor/RedlineView.tsx` | Add risk-colored highlights, click-to-scroll sync, toolbar with counts |
| `src/components/chat/ChatInput.tsx` | Add Google Drive button in Sources popover |
| `src/components/vault/VaultDetail.tsx` | Add Google Drive import button |

