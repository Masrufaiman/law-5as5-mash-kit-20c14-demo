

# Plan: Fix Legal API Tool Execution + Red Flag Auto-Open

## Problem 1: Legal API Tools Never Execute

There are **four** distinct bugs causing tool failure:

### Bug A — Decryption crash kills all encrypted keys
The edge function logs show: `Decrypt perplexity key failed: TypeError: iv length not equal to 12 or 16`. This crashes for Perplexity AND CourtListener. When `perplexityKey = ""` and `courtListenerKey = ""`, the routing falls back to `nextTool = ""` and the loop never runs.

**Root cause**: The `api_key_iv` column may be null/empty for some rows (e.g., when saved without a key, or if the column wasn't populated correctly). The `decryptApiKey` function at line 15 does `ivHex.match(/.{1,2}/g)!` which crashes on empty strings.

**Fix**: Guard `decryptApiKey` — if `api_key_iv` is falsy or produces wrong-length IV, skip decryption gracefully instead of crashing the entire request.

### Bug B — Multiple sources selected → only ONE tool runs
When user selects CourtListener + EDGAR + EUR-Lex simultaneously, `classifyRequestType` returns a single type (TYPE 2 for CourtListener). Only CourtListener runs; EDGAR and EUR-Lex never execute.

**Fix**: Before the ReAct loop, build a `toolQueue` from user-selected sources. If sources include "CourtListener", queue `courtlistener`. If sources include "EDGAR (SEC)", queue `edgar`. If sources include "EUR-Lex", queue `eurlex`. Execute ALL queued tools sequentially, then proceed to synthesis.

### Bug C — Inner monologue can't suggest legal tools
The monologue prompt only knows about `vault_search|web_search|read_files`. After the first legal tool runs, the monologue can never suggest running another legal tool.

**Fix**: Update `INNER_MONOLOGUE_PROMPT` to include `courtlistener|edgar|eurlex` in the `next_tool` options. Also pass which tools are enabled as context.

### Bug D — EDGAR API endpoint may not return expected format
The URL `https://efts.sec.gov/LATEST/search-index?q=...` uses `search-index` but the correct EDGAR EFTS endpoint is `https://efts.sec.gov/LATEST/search-index?q=...`. The response may not have `hits.hits` format. Need to also try the EDGAR company search API as fallback: `https://www.sec.gov/cgi-bin/browse-edgar?company=...&CIK=&type=10-K&action=getcompany&output=atom`.

**Fix**: Use `https://efts.sec.gov/LATEST/search-index?q=...` as primary, add `https://efts.sec.gov/LATEST/search-index?q=...&forms=...` as secondary, and add the company search endpoint as tertiary fallback.

### Bug E — System prompt doesn't enforce tool calls
The LLM can plan steps but then skip tool execution and tell the user to search manually.

**Fix**: Add to the base system prompt: "If CourtListener, EDGAR, or EUR-Lex tools are enabled, you MUST use them. NEVER tell the user to perform a search manually."

## Problem 2: Red Flag Right Panel Not Auto-Opening

The auto-open code at Chat.tsx lines 432-451 exists but has issues:

### Bug A — `handleFileClick` may not find the file
When red flag analysis completes, `handleFileClick` queries Supabase by file name. If the file name in `frozenFileRefs` doesn't exactly match the DB record name, the query returns null and `editorDoc` never gets set.

**Fix**: Instead of relying on `handleFileClick` to fetch the file, extract the document content directly from the message. The `toolReadFiles` already loaded the document content into the accumulated context. Parse the red flag data AND the document text from the assistant message content, then set `editorDoc` directly.

### Bug B — Auto-open still checks `frozenFileRefs` which may be undefined
The code does `(lastAssistant as any).frozenFileRefs || fileRefs` — but `frozenFileRefs` on a freshly streamed message may not exist, and `fileRefs` from the hook may already be cleared.

**Fix**: Always try to find the document via the conversation's `conversationAttachedFileIds` as a final fallback. Also, when red flag data is parsed, try to open the file immediately using the known attached file IDs.

## Implementation

### File: `supabase/functions/llm-router/index.ts`

1. **Fix decryption guard** (lines 7-18): Wrap in try/catch, return empty string if IV is invalid
2. **Build multi-tool queue** (lines 1022-1056): When user selects multiple sources, build array of tools and iterate through all of them
3. **Update inner monologue prompt** (line 474): Add `courtlistener|edgar|eurlex` to next_tool options
4. **Add tool enforcement to system prompt** (lines 723-754): Add directive that tools MUST be called when enabled
5. **Fix EDGAR URL** (lines 206-245): Add fallback to `https://efts.sec.gov/LATEST/search-index` without the `forms` filter, and add company search fallback
6. **Pass enabled tools to monologue** (lines 506-519): Include `enabled_tools` in monologue input

### File: `src/pages/Chat.tsx`

1. **Fix red flag auto-open** (lines 432-451): When red flags detected, use `conversationAttachedFileIds` to reliably open the file. Add a retry mechanism with a small delay if `handleFileClick` fails the first time.
2. **Fallback: set editorDoc from file content in last message**: If the file contains extracted text from the red flag analysis, parse it from the message context and set `editorDoc` directly.

## File Changes Summary

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Fix decrypt guard; multi-tool queue for selected sources; inner monologue knows legal tools; system prompt enforces tool calls; EDGAR fallback URLs |
| `src/pages/Chat.tsx` | Red flag auto-open uses conversationAttachedFileIds fallback; retry mechanism |

