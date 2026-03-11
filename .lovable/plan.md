

# Plan: Agentic AI Upgrade — ReAct Loop with Inner Monologue

## Overview

Transform the current single-pass pipeline (`query → RAG → search → LLM → response`) into a multi-iteration ReAct agent with inner monologue, auto-escalating search depth, self-verification, and rich UI events.

## Current State

The `llm-router` runs one linear flow: load knowledge → RAG search → Perplexity search → build prompt → stream LLM response. No iteration, no inner monologue, no self-check. The Perplexity model is selected once based on regex heuristics.

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  llm-router (ReAct Agent)                       │
│                                                 │
│  1. INTENT ANALYSIS (LLM call → structured)     │
│     → emit: intent, plan                        │
│                                                 │
│  2. EXECUTION LOOP (max 20 iterations)          │
│     ┌───────────────────────────────────┐       │
│     │  Tool call (vault_search,         │       │
│     │   web_search, read_files)         │       │
│     │         ↓                         │       │
│     │  INNER MONOLOGUE (LLM call)       │       │
│     │   → observation, gaps, next_action│       │
│     │   → emit: thinking, step,         │       │
│     │     escalation, inline_data       │       │
│     │         ↓                         │       │
│     │  Decision: TOOL / REPLAN /        │       │
│     │           VERIFY / FINISH         │       │
│     └───────────────────────────────────┘       │
│                                                 │
│  3. SELF-VERIFICATION (LLM call)                │
│     → emit: self_check                          │
│     → if fails: loop back to step 2             │
│                                                 │
│  4. FINAL SYNTHESIS (streaming LLM call)        │
│     → emit: final_answer tokens                 │
│                                                 │
│  5. DONE → persist metadata                     │
└─────────────────────────────────────────────────┘
```

## Implementation

### Phase 1: Backend — ReAct Agent (`llm-router/index.ts`)

**Complexity scoring & auto model selection:**
- Replace regex-based `selectPerplexityModel()` with `assessComplexity()` that scores 0-10 based on jurisdiction count, case law keywords, regulatory terms, comparative analysis
- Score 0-2 → `sonar`, 3-5 → `sonar-pro`, 6-8 → `sonar-deep-research`, 9+ → `sonar-deep-research` with `reasoning_effort: "high"`
- Jurisdiction prefix prepended to every search query (UK → "UK law England Wales:", US → "US law federal:", etc.)

**Intent analysis (Phase 1 of agent):**
- Before the main loop, make a non-streaming LLM call with tool_choice to extract structured intent: task type, jurisdictions, search depth, estimated steps, specific plan items
- Emit `intent` and `plan` SSE events

**Execution loop (Phase 2-3):**
- Define tool functions: `vault_search` (Qdrant), `web_search` (Perplexity), `read_files` (direct text), `read_multiple_files` (parallel)
- After each tool call, run inner monologue — a separate LLM call that outputs JSON: `{ observation, confidence, gaps, next_action, thinking_narration, ... }`
- Based on `next_action`: call another tool (TOOL), update plan (REPLAN → emit `plan_update`), cross-check a claim (VERIFY → emit `verify_start`/`verify_end`), or proceed to synthesis (FINISH)
- Progressive escalation: start with `sonar`, if results insufficient, upgrade to `sonar-pro`, then `sonar-deep-research` — emit `escalation` event
- If tool returns empty: rephrase query and retry (up to 3 attempts before reporting)
- Inline data extraction: if structured data found mid-loop, emit `inline_data` with headers/rows
- Vault-first: always search vault before web; skip web if vault answers sufficiently

**Self-verification (Phase 4):**
- Before final synthesis, run self-check LLM call: "Did you fully answer? Are citations real? Anything missing?"
- Emit `self_check` event; if check fails, loop back

**Final synthesis (Phase 5):**
- Stream the final answer using the admin-configured chat LLM
- Emit `final_answer` tokens (distinct from regular `token` events so frontend can render with white background and divider)

**Contradiction detection:**
- If two vault chunks or search results conflict, emit `contradiction` event with both sources

### Phase 2: New SSE Events

| Event | Data | Frontend handling |
|-------|------|-------------------|
| `intent` | `{ taskType, jurisdictions, complexity }` | Show in step tracker |
| `plan_update` | `{ steps, reason }` | Animate new items into checklist with "Plan updated" badge |
| `escalation` | `{ from, to, reason }` | Show accent badge "Upgrading to Deep Research..." |
| `contradiction` | `{ sourceA, sourceB, claim }` | Orange-bordered expandable block |
| `verify_start` | `{ claim }` | "Cross-checking: [claim]..." |
| `verify_end` | `{ claim, verified, source }` | ✓ Verified or ⚠ Unverified |
| `inline_data` | `{ headers, rows }` | Render table immediately, animated |
| `self_check` | `{ status: "running" \| "passed" \| "failed" }` | Dashed border block |
| `final_answer` | `{ content }` | White background below divider |

### Phase 3: Frontend — `useStreamChat.ts`

- Add handlers for all new event types
- Add new state: `inlineData`, `contradictions`, `verifications`, `selfCheckStatus`, `escalations`
- `final_answer` tokens stored separately so UI can render below a divider
- Freeze all new metadata types for persistence

### Phase 4: Frontend — `StepTracker.tsx` & `MessageBubble.tsx`

**StepTracker enhancements:**
- Plan update animation: new items slide in with "Plan updated" badge
- Escalation badge: `#e7fd7e` background, dark text
- Contradiction block: orange left border, expandable
- Verify blocks: "Cross-checking..." → ✓/⚠ result
- Self-check block: dashed `#e7fd7e` border, disappears when passed
- Progress counter: bottom right, IBM Plex Mono, `#2596be`

**MessageBubble enhancements:**
- Final answer divider: 2px `#dde8f0` line with centered "LawKit Response" label
- Inline data tables: `#2596be` header, alternating white/`#f8ffde` rows, animate opacity+y
- File chips: `#d6eef6` bg, `#2596be` text/border
- Confidence markers: ⚠ for low-confidence claims

### Phase 5: System Prompt — `getLawKitBasePrompt()`

- Build jurisdiction-aware base prompt with org knowledge injection
- Operating principles: never answer from memory, never cite unverified sources, surface contradictions
- Citation format: `[filename · p.4]` or `[Perplexity Search · URL]`
- Injected per-request based on detected jurisdiction

## Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Complete rewrite of streaming handler: ReAct loop, inner monologue, tool dispatch, self-verification, new SSE events, complexity scoring, jurisdiction prefixing |
| `src/hooks/useStreamChat.ts` | Handle 8 new SSE event types, new state variables, freeze new metadata |
| `src/components/chat/StepTracker.tsx` | Plan update animation, escalation/contradiction/verify/self-check blocks, progress counter, themed colors |
| `src/components/chat/MessageBubble.tsx` | Final answer divider, inline data tables, confidence markers |
| `src/pages/Chat.tsx` | Pass new state to MessageBubble/StepTracker |

## Constraints & Safeguards

- `MAX_ITERATIONS = 20` hard limit in the loop
- Inner monologue uses the same admin-configured chat LLM (no hardcoded model names)
- Each tool call logged (step events serve as audit trail)
- Perplexity model auto-selected by complexity score, never hardcoded
- Vault always searched before web
- 3 retry attempts before reporting tool failure

## What This Does NOT Change

- Database schema (no migration needed — existing `metadata` JSONB handles everything)
- Authentication flow
- File upload pipeline
- Document/Sheet editors
- Admin panel configuration

