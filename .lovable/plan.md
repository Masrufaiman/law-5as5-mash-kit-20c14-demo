

# Production-Grade AI Agent Overhaul

This is a comprehensive upgrade across the AI backend, chat UI, citations, steps, prompt modes, and sidebar — modeled after the Harvey AI reference screenshots.

---

## Changes Overview

### 1. Fix Citation Numbering (Issues #4, #5)

**Problem**: Perplexity citations use `index: 100+` internally, causing `[Web]` display. SourcesFooter says "Web search".

**Files**: `llm-router/index.ts`, `SourcesFooter.tsx`

- Re-index perplexity citations starting from `ragCitations.length + 1` instead of `i + 100`
- In `SourcesFooter.tsx`, replace "Web search and documents — N cited" with just "Sources — N cited" (no mention of "web search")
- Remove the Globe icon, use a generic sources icon

### 2. Favicon Citations as a Step (Issue #6)

**Problem**: Web source favicons only appear in the collapsed SourcesFooter. Harvey shows them inline under steps as they're found.

**Files**: `llm-router/index.ts`, `StepTracker.tsx`, `useStreamChat.ts`

- Add a new SSE event type `"sources"` emitted right after Perplexity returns, containing `{ urls: string[], domains: string[] }`
- In `useStreamChat.ts`, handle the `"sources"` event type and store in a new `searchSources` state
- In `StepTracker.tsx`, render a row of favicon pills (domain + favicon) under the steps list when `searchSources` is available — exactly like Harvey's screenshot (image 75) showing "Acme Corp", "Law360", "Reuters Legal News" etc.

### 3. Better Steps / Immediate Feedback (Issues #3, #8, #9)

**Problem**: User sees skeleton, then nothing until "Generating response". Harvey shows granular steps like "Assessing query", "Planning for analysis", "Researching complaint details", etc.

**Files**: `llm-router/index.ts`

- Emit steps progressively throughout processing instead of batching:
  - Immediately: `"Analyzing your query"` (before any DB calls)
  - After knowledge base load: `"Loading knowledge base"`
  - After vector search: `"Searching documents"` → `"Found N relevant sections"`
  - After Perplexity: Instead of `"Running web search (sonar)"`, use: `"Researching relevant sources"` or `"Analyzing legal precedents"` — NEVER mention model names or "web search" to the user
  - Before AI call: `"Synthesizing response from N sources"`
- For deep research: show `"Deep analysis across 25+ sources"` instead of `"Running deep research (sonar-deep-research)"`
- Send each step as its own SSE event immediately (don't batch)

### 4. Conversation Memory (Issues #2, #12)

**Problem**: History is sent but limited. The `history` array from the client only contains messages from the current session state.

**Files**: `llm-router/index.ts`

- Load the last 20 messages from the `messages` table for this `conversationId` directly in the edge function, instead of relying on client-sent `history`
- This ensures the AI always has full conversation context even after page refreshes
- Keep client-sent history as fallback for new conversations

### 5. Prompt Modes — Not System Prompts (Issues #10, #18)

**Problem**: "Prompts" popover shows raw system prompts. Should show friendly mode names with descriptions, and NOT paste system prompts into the input.

**Files**: `ChatInput.tsx`, `Home.tsx`

- Replace "Prompts" button with a "Mode" dropdown showing:
  - **Chat / Research** — "Ask questions, analyze documents, research topics"
  - **Draft Document** — "Generate contracts, memos, briefs, and legal documents"  
  - **Red Flag Detection** — "Identify risks, compliance issues, and red flags"
- Clicking a mode sets `promptMode` state only — does NOT paste the system prompt into the textarea
- Show the selected mode as a small label next to the send button (like Harvey's "Chat v" dropdown)
- The system prompt from agent_config is applied server-side only (already works this way via `useCase`)

### 6. Header Title Editing Fix (Issue #11)

**Problem**: Truncated title shows "......" and clicking doesn't clearly indicate editability.

**Files**: `Chat.tsx`

- When title is truncated, show full title on hover (tooltip)
- Make the edit input wider (full available header width)
- Show the pencil icon always (not just on hover) when title is "New Conversation" or very short
- Auto-select all text when editing starts

### 7. Sidebar Scroll for Recent Chats (Issue #17)

**Problem**: Currently `max-h-52` on recent chats ScrollArea. After 10 chats it's cramped.

**Files**: `NavigationSidebar.tsx`

- Show first 10 chats directly visible
- Change `max-h-52` to `max-h-[280px]` to fit ~10 items
- The ScrollArea already handles overflow scrolling for the rest

### 8. Skeleton Alignment (Issue #16)

**Problem**: Loading skeleton not aligned with user's prompt.

**Files**: `Chat.tsx`

- The streaming indicator already renders right after the last user message (`isLastUser && showStreamingIndicator`). Ensure the `pl-8` padding matches the assistant message padding exactly.
- Already looks correct in code — verify the `mt-4` spacing matches normal message spacing (`space-y-6`). Change `mt-4` to `mt-6` to match.

### 9. Sources Footer Redesign (Issue #18 — Harvey-style)

**Files**: `SourcesFooter.tsx`

- Redesign to match Harvey's style (image 79):
  - Label: "Sources" with count (not "Web search")
  - Expandable pill showing favicon + domain for each source
  - Compact single-line when collapsed, grid when expanded
  - No "Web Search" text anywhere

### 10. System Prompt Quality (Issues #1, #13, #14, #15, #19, #20)

**Files**: `llm-router/index.ts`

Upgrade the system prompt with production-grade instructions:

```
## Response Quality Rules
- Always analyze the FULL content of ALL provided documents before responding
- When asked about totals/sums, compute actual numbers with per-document breakdowns
- Structure responses with clear sections, headers, and bullet points
- Use markdown tables for comparative data
- Be analytical and thorough — reason through complex questions step by step

## Document Generation Rules  
- You CAN generate documents in ANY mode (chat, research, red flag)
- When the user's query implies document creation (draft, write, create, prepare), generate the full document
- Start documents with "# Document Title" to trigger the editor panel
- Use actual organization data — never placeholders

## Generative UI Rules
- Only use numbered bold choices when you genuinely need user input between 2-4 distinct approaches
- NEVER use choice formatting for: data listings, analysis results, document summaries, financial breakdowns
- When you have sufficient context, proceed with analysis directly — don't ask unnecessary clarifying questions

## Citation Rules
- Use [1], [2], [3] notation — sequential integers only
- Never use [Web] or any non-numeric citation markers
- Cite every factual claim with its source number
```

### 11. Deep Research Branding (Issue #8)

**Files**: `ChatInput.tsx`, `Home.tsx`, `llm-router/index.ts`

- Rename "Deep" toggle label to "Deep research" (like Harvey)
- In steps, show "Analyzing across 25+ sources" instead of mentioning sonar/deep-research
- Never expose internal model names to the user

---

## Files Modified

| File | Changes |
|------|---------|
| `llm-router/index.ts` | Server-side history loading, progressive steps, citation re-indexing, upgraded system prompt, hide internal details from steps |
| `useStreamChat.ts` | Handle `"sources"` SSE event for favicon display |
| `StepTracker.tsx` | Add favicon pills row for search sources (Harvey-style) |
| `SourcesFooter.tsx` | Redesign: "Sources — N cited", no "Web search" text |
| `CitationPopover.tsx` | Minor: ensure numeric display always |
| `ChatInput.tsx` | Mode selector dropdown instead of raw prompts, "Deep research" label |
| `Home.tsx` | Same mode selector, "Deep research" label, no system prompts in UI |
| `Chat.tsx` | Title edit fix, skeleton alignment, streaming indicator spacing |
| `NavigationSidebar.tsx` | Increase recent chats scroll height |

