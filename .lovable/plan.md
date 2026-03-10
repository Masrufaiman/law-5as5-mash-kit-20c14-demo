

# Plan: Harvey-Inspired UI Polish, `@mention` Sources, Review Table Fix, and Chat Enhancements

## Issues Identified

1. **Review table not opening in right sidebar** — The AI outputs a plain markdown table instead of the `<!-- SHEET: Title -->` JSON format. The `llm-router` review mode prompt needs to be stricter about outputting the correct format.

2. **Chat UI doesn't match Harvey's polish** — From the reference images:
   - Steps show expandable reasoning with bullet points and indented sub-reasoning (not just step names)
   - Version cards appear inline in chat (clickable "Version 1" / "Version 2" cards with timestamps)
   - Document editor toolbar is more compact with `«` collapse, Sources link, version indicator
   - "Generating new version..." progress indicator appears inline during streaming
   - Response actions show Copy, Save prompt, Edit query under user messages
   - StepTracker shows detailed reasoning text with bullet points (not just step names)

3. **No `@mention` for sources** — Users should type `@` in the prompt box to get an autocomplete dropdown of vault files and sources they can reference inline.

4. **StepTracker reasoning** — Harvey shows detailed bullet-point reasoning inside each step (expandable per step). Current implementation shows all reasoning in one block.

## Changes

### 1. Fix Review Table Output (`supabase/functions/llm-router/index.ts`)
- Make the review mode system prompt more explicit: the AI **must** output `<!-- SHEET: Title -->` followed by a ```json block with `{columns, rows}` structure. Add few-shot example in the prompt.
- Re-deploy the edge function.

### 2. `@mention` Autocomplete in Prompt Box (`src/components/chat/ChatInput.tsx`)
- Detect when user types `@` — show a floating dropdown listing vault files and sources.
- Filter as user types after `@`.
- On selection, insert `@FileName` as a badge/chip in the textarea and pass the file reference to the send handler.
- Load files from the selected vault or all vaults via Supabase query.

### 3. Version Cards in Chat (`src/components/chat/MessageBubble.tsx`)
- When a document or sheet is detected, render a "Version N" card (bordered, with timestamp) similar to Harvey's UI. Clicking it opens the editor panel.
- Show "Generating new version..." with a spinner during streaming when the mode is draft/review.

### 4. Enhanced StepTracker (`src/components/chat/StepTracker.tsx`)
- Per-step expandable content: each step can have a description/detail text (from the `step.detail` field if provided by llm-router).
- Show bullet-pointed reasoning within the expanded step view.
- Better visual hierarchy matching Harvey: check marks, step descriptions in muted text below step name.

### 5. Polished Document Editor Toolbar (`src/components/editor/DocumentEditor.tsx`)
- Add a `«` button to collapse the Quill toolbar (toggle).
- Add "Sources" link in toolbar header (shows citation list from the conversation).
- Compact version indicator: `✓ Show edits · ⊕ Sources · ⊙ Version 2 · ✕`

### 6. User Message Actions (`src/components/chat/MessageBubble.tsx`)
- Add "Copy", "Save prompt", "Edit query" actions under user messages (matching Harvey reference).

### 7. Chat Header Enhancements (`src/pages/Chat.tsx`)
- Show metadata under title: `Assist · ⊕ Files · 1 source · Created Mar 10, 2026`
- Add "... " menu button next to Export for additional actions.

### 8. ResponseActions Polish (`src/components/chat/ResponseActions.tsx`)
- Match Harvey layout: Copy, Download, Regenerate on the left; ThumbsUp, ThumbsDown on the right with more spacing.

---

## Files Modified

| File | Changes |
|------|---------|
| `llm-router/index.ts` | Fix review mode prompt with explicit SHEET format + few-shot example |
| `ChatInput.tsx` | Add `@mention` autocomplete dropdown for vault files/sources |
| `MessageBubble.tsx` | Version cards inline, "Generating new version..." indicator, user action polish |
| `StepTracker.tsx` | Per-step expandable details, bullet-point reasoning, better visual hierarchy |
| `DocumentEditor.tsx` | Collapsible toolbar (`«`), Sources link, compact toolbar layout |
| `ResponseActions.tsx` | Layout polish matching Harvey |
| `Chat.tsx` | Header metadata (sources count, date), three-dot menu |

