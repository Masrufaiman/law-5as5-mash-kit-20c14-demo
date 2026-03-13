
Goal: deliver production-grade behavior for search routing, clickable sources, fast non-agentic replies, and reliable redline document reopening/persistence.

What I found (from current code + your logs/screens):
1) Full prompt is sent directly to legal tools (`nextInput.query || message`), so EUR-Lex/CourtListener/EDGAR get raw instruction text instead of focused legal queries.
2) No true multi-query decomposition exists yet (single query per tool call).
3) “Source 2015 / Source 2022” non-clickable chips come from citation parsing treating legal year brackets like `[2015]` as citation indices.
4) Fast/pro/deep/advanced routing is only partially implemented; no per-subquery tier strategy and no explicit “advanced deep research policy.”
5) “hi” is slow because planner + intent + knowledge loading + ReAct loop run even for trivial chat.
6) Redline first-open/second-open issues are caused by:
   - `read_files` returning “No documents found” after timeout, then synthesis proceeds anyway.
   - message-level file refs/context not reliably restorable after reload.
   - prompt state save/restore race in Chat page (restore can be overwritten by immediate save).

Clarifications applied from your answers:
- Simple short chats should use instant path.
- Keep thinking/steps visible.
- Restore all context after reload.

Implementation plan

Phase 1 — Query decomposition + multi-search orchestration (backend)
Files: `supabase/functions/llm-router/index.ts`
- Add `decomposeSearchQueries(message, tool, jurisdictions, requestType)`:
  - strips meta-instructions (“search X”, “cite Y”, “deep research:”).
  - extracts case names/statutes/entities.
  - outputs 2–4 targeted queries per tool.
- Update tool executor to support array queries and merge/dedupe results.
- Replace direct `nextInput.query || message` dispatch with decomposed query sets.
- Add tool-specific query shaping:
  - CourtListener: case-name + doctrine + jurisdiction-focused variants.
  - EUR-Lex: CELEX-first + legal concept fallback (not full prompt).
  - EDGAR: company/form/date variants.

Phase 2 — Perplexity tier contract (fast/pro/deep/advanced)
Files: `supabase/functions/llm-router/index.ts`
- Enforce tier mapping:
  - Fast Search → `sonar` (simple factual/no legal research).
  - Pro Search → `sonar-pro` (default floor for legal/jurisdiction/case/statute work).
  - Deep Research → `sonar-deep-research`.
  - Advanced Deep Research → `sonar-deep-research` + `reasoningEffort: high` + expanded multi-angle query bundle.
- Apply model per search task/subquery (not one global fixed choice).
- Keep final synthesis strictly on admin-configured LLM (already aligned; preserve).

Phase 3 — Citation reliability + clickable source integrity
Files:
- `supabase/functions/llm-router/index.ts`
- `src/components/chat/CitationPopover.tsx`
- `src/components/chat/SourcesFooter.tsx`
- `src/components/chat/SourcesPanel.tsx`
- `src/components/chat/StepTracker.tsx`
- `src/components/chat/MessageBubble.tsx` (citation injection guard)
- Backend:
  - normalize citation objects with source type + URL presence.
  - map Perplexity index/title outputs to real URLs via `search_results`.
  - if URL missing: mark reference-only explicitly.
- Frontend:
  - for reference-only citations: no dead click; show clear “URL unavailable” notice.
  - keep file citations clickable when file resolution exists.
- Critical parser fix:
  - stop interpreting legal year brackets (`[2015]`, `[2022]`) as citation indices unless they match a real citation index range.

Phase 4 — Fast-path for simple chat (“hi” latency fix)
Files: `supabase/functions/llm-router/index.ts`
- Add pre-router shortcut for trivial conversational prompts:
  - conditions: very short message, no attached files, no selected legal sources, no deep research, no special mode.
  - bypass intent planner/ReAct/self-check/tool loop.
  - direct quick synthesis response.
- Result: avoids 3–8s overhead on casual prompts while preserving agentic flow for real research tasks.

Phase 5 — Redline reliability and non-hallucination when document missing
Files:
- `supabase/functions/llm-router/index.ts`
- `src/pages/Chat.tsx`
- `src/components/chat/MessageBubble.tsx`
- Backend:
  - if red-flag mode + `read_files` returns no document text, do NOT fabricate analysis.
  - return explicit processing/wait message and keep retry-safe behavior.
  - extend read wait logic for freshly uploaded files (bounded poll with clear terminal state).
- Frontend:
  - strengthen open logic to always have a reopen path from message metadata.
  - on red flag card click, fallback to latest attached file IDs if frozen refs absent.
  - avoid “opens once then never again” by using stable file identity (ID-first lookup).

Phase 6 — Reload persistence of mode/sources/files context
Files:
- `src/pages/Chat.tsx`
- `src/hooks/useStreamChat.ts`
- `supabase/functions/llm-router/index.ts`
- Fix localStorage race:
  - hydrate first, then enable save writes.
- Persist/restore conversation context:
  - prompt mode, deep research, active sources, selected vault.
  - attached file IDs/names used in conversation scope.
- Save user message attachment metadata from backend when inserting message; reload reconstructs chips/context from DB + local state fallback.

Technical details (concise)
- Keep retry cap at 2 for legal tools; after cap, fallback to targeted web search.
- Preserve current visibility of steps/thinking (per your preference), but only run heavy agentic pipeline when needed.
- Keep token budgets already raised (8k/16k), and maintain non-truncation behavior for legal tables.
- No DB schema changes required; use existing `messages.metadata` for attachment/context persistence.

Acceptance criteria
1) Complex legal prompt no longer sent raw to EUR-Lex/CourtListener/EDGAR; tools receive focused sub-queries.
2) For one legal request, system executes multiple targeted searches and merges results.
3) No dead source clicks: every source either opens URL/file or clearly says URL unavailable.
4) No bogus “Source 2015” citations from year brackets.
5) “hi” replies fast via instant path without full agentic workflow.
6) Redline open works repeatedly (first, second, after reload) and never fabricates red flags when file text is unavailable.
7) After reload, selected mode/sources/deep toggle/attached-file context are restored for that conversation.
