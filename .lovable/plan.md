

# Plan: Harvey-Style Agentic UI, Sheet Fixes, and Markdown Polish

This is a large overhaul touching the streaming protocol, step tracker, message rendering, sheet editor, and the backend edge function. Here is the breakdown.

---

## 1. Fix Review Table Not Opening in Sidebar

**Root cause**: The AI sometimes outputs a plain markdown table instead of the `<!-- SHEET: -->` JSON format. Two issues:
- The `reviewModePrompt` is used as the system prompt but the `basePrompt` is NOT included when review mode is active (line 511: `reviewModePrompt || basePrompt`). This means the review prompt replaces the entire base prompt including citation/formatting rules. The review prompt itself is correct but the AI may still ignore it.
- Need to add a stronger instruction and include the existing sheet data in the prompt when a sheet already exists in conversation history, so the AI updates it as a new version instead of creating a fresh table.

**File: `supabase/functions/llm-router/index.ts`**
- When `effectiveMode === "review"` AND conversation history contains a `<!-- SHEET:` block, extract the existing sheet JSON and include it in the system prompt as "Current sheet state — modify this and output the updated version"
- Add a final user-facing instruction: "IMPORTANT: Output ONLY the <!-- SHEET: --> format. Never use markdown tables."

## 2. AI Column Fill — Actually Send Data to AI

**File: `src/components/editor/SheetEditor.tsx`**
- When a column with `fillMode === "ai"` is added via `handleAddColumn`, trigger an async call to `llm-router` (or a new edge function endpoint) that sends:
  - Column name, type, query/description
  - The list of row file names
  - The vault context
- The AI returns values for each row, which are populated into the sheet
- Show a loading state per-cell while AI is filling ("Extracting..." shimmer)
- Use the existing `CHAT_URL` endpoint with a special `useCase: "column_fill"` that returns a JSON response (non-streaming)

**File: `supabase/functions/llm-router/index.ts`**
- Add handling for `useCase === "column_fill"` — a non-streaming request that takes column metadata + file names/content and returns `{ values: { "file1.pdf": "extracted value", ... } }`

## 3. Sheet Versioning — AI Updates Existing Sheet

**File: `src/pages/Chat.tsx`**
- When `handleSheetOpen` receives new sheet data from a subsequent message, instead of replacing `sheetDoc`, merge it as a new version in the existing SheetEditor
- Pass the current sheet state to `sendMessage` options so the backend knows the current sheet

**File: `src/components/editor/SheetEditor.tsx`**
- When `data` prop changes (new version from AI), auto-add it as a new version instead of resetting versions array
- Compare with `useEffect` on `data` — if `data.title` matches current title but content differs, push as new version

## 4. Fix Broken Markdown Tables and Text in Chat

**File: `src/components/chat/MessageBubble.tsx`**
- The markdown rendering already has table components but they need better styling
- Add `remarkGfm` plugin to ReactMarkdown for proper GitHub-flavored markdown table support (pipe tables)
- Fix table cell wrapping, ensure proper borders and padding
- Add `white-space: normal` and `word-break: break-word` to table cells

**Dependencies**: Add `remark-gfm` package

## 5. Harvey-Style Agentic StepTracker

This is the biggest change. The current StepTracker shows a flat list of step labels. Harvey shows:

- A planning phase checklist at the top
- Each step as a collapsible block with duration, detail text, and sub-steps
- Inline thinking text between steps
- Progress indicator (Step X / Y)
- Document reference chips
- Final output visually separated

### New SSE Event Types (Backend)

**File: `supabase/functions/llm-router/index.ts`**
Add new event types alongside existing ones:
- `{ type: "plan", steps: ["step 1", "step 2", ...] }` — emitted first, before any work
- `{ type: "step", step: { name, status, detail?, duration?, substeps? } }` — enhanced step with optional detail/duration
- `{ type: "thinking", content: "..." }` — visible reasoning between steps (different from `reasoning` which is hidden think blocks)
- `{ type: "file_refs", files: [{ name, id }] }` — document references discovered during a step

Extend `AgentStep` interface:
```typescript
export interface AgentStep {
  name: string;
  status: "done" | "working";
  detail?: string;
  duration?: string;
  substeps?: { name: string; status: string }[];
}
```

### Enhanced StepTracker Component

**File: `src/components/chat/StepTracker.tsx`** — Full rewrite:

- **Plan checklist**: If a `plan` event was received, render it as a checkbox list at the top (○ unchecked → ✓ checked as steps complete)
- **Per-step collapsible blocks**: Each step is its own `Collapsible` with:
  - Header: step name + duration (e.g., "Reading documents · 3s") + check/spinner icon
  - Body: detail text, sub-steps (indented), document reference chips
- **Progress indicator**: "Step X / Y" badge in the top-right of the tracker
- **Thinking text**: Streamed inline between steps as muted italic text
- **File reference chips**: Blue pill badges for files mentioned during analysis, with "View N more..." if > 5
- **Search source pills**: Keep existing favicon pills but move inside the relevant step

### useStreamChat Updates

**File: `src/hooks/useStreamChat.ts`**
- Add `plan` state: `string[]` — the initial plan steps
- Add `thinkingText` state: streamed visible reasoning
- Add `fileRefs` state: `{ name: string; id?: string }[]`
- Handle new SSE event types: `plan`, `thinking`, `file_refs`
- Track step durations client-side (timestamp when step starts → timestamp when done)

### MessageBubble Updates

**File: `src/components/chat/MessageBubble.tsx`**
- Pass new props to StepTracker: `plan`, `thinkingText`, `fileRefs`
- Add visual separator between steps/thinking region and the final answer (a subtle `border-t` divider)
- The steps region gets a slightly different background (`bg-muted/20` rounded container)

### Backend: Emit Plan First

**File: `supabase/functions/llm-router/index.ts`**
- Before starting any work, make a quick LLM call (or deterministic logic) to generate a plan based on the query
- For complex queries (vault + search), emit a plan like: `["Analyze query", "Search documents", "Research sources", "Synthesize response"]`
- For simple queries, emit a shorter plan: `["Analyzing", "Generating response"]`
- Emit `{ type: "plan", steps: [...] }` as the first SSE event
- Track timing: record `Date.now()` at step start, include duration in step done event

---

## Files Modified

| File | Changes |
|------|---------|
| `useStreamChat.ts` | Add `plan`, `thinkingText`, `fileRefs` state; handle new SSE events; track step durations |
| `StepTracker.tsx` | Full rewrite: plan checklist, per-step collapsibles, progress indicator, file chips, thinking text |
| `MessageBubble.tsx` | Add `remark-gfm`, pass new props to StepTracker, visual separator for final answer, fix table styles |
| `SheetEditor.tsx` | AI column fill logic, version merge on data change, loading states |
| `Chat.tsx` | Pass sheet state to sendMessage, handle version merging |
| `llm-router/index.ts` | Plan emission, column_fill use case, sheet state in review prompt, enhanced step events with duration |

**New dependency**: `remark-gfm`

