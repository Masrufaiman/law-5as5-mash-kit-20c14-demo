

# Plan: Fix 6 Issues — Selection Reply, Dynamic MCQs, Upload UX, Table Rendering, Streaming Skeleton, Document Editor Polish

## Issues from Screenshots and Feedback

1. **Selection Reply not working** — The `handleMouseDown` clears `selectionTooltip` before the click registers on the Reply button. The current `isReplyingRef` fix only prevents `handleMouseUp` from clearing, but `handleMouseDown` fires on the Reply button click itself and clears it first. The button's `onClick` then reads `selectionTooltip` as `null`.

2. **Static MCQs / broken `**` in AI responses** — The AI sometimes outputs `**Misrepresentation or Hallucination by AI:**` with markdown bold markers that render as visible asterisks when the response also gets parsed as MCQ choices. The ChoiceCards static fallback was removed, but the AI's system prompt doesn't instruct it to generate contextually relevant numbered choices with proper markdown.

3. **File upload takes too long — needs rotating loading text** — When `isProcessingFiles` is true, the button just says "Uploading..." statically. Add cycling status messages like "Uploading files...", "Processing documents...", "Extracting text...", "Almost ready..." on a 3-second interval.

4. **Tables not rendering in response / incomplete response** — The markdown table in the MFN analysis response is broken because the AI outputs `| LP Name | MFN Right? | Scope |` format inline within paragraph text instead of with proper newlines. The `ReactMarkdown` + `remarkGfm` setup requires blank lines before/after tables. Also the step timing shows 72s+58s+54s but collapsed says 15s — the collapsed timer sums `step.duration` which are strings like "3s" parsed as integers, not the actual wall-clock values.

5. **Streaming skeleton — show text placeholder while AI writes** — During streaming, when the AI starts outputting tokens but content is still sparse, show a skeleton placeholder below the existing text to hint more content is coming.

6. **Document editor UX improvements** — Better heading rendering, smoother transitions, cleaner toolbar.

## File Changes

### `src/pages/Chat.tsx`
**Fix selection reply race condition:**
The issue is that `handleMouseDown` fires before `onClick`. Change approach: in `handleMouseDown`, check `target.closest("[data-reply-tooltip]")` — this check already exists at line 358. The bug is that clicking the Reply **button** triggers `mousedown` on `document`, but the tooltip div has `data-reply-tooltip`. This should work. Let me re-examine: the `handleMouseDown` uses `e.target` which is the `<button>` element. `button.closest("[data-reply-tooltip]")` should find the parent div. The actual issue may be timing — `mousedown` fires, clears tooltip to null, then when `onClick` fires, `selectionTooltip` is already null so `handleReplyWithSelection` returns early.

Fix: Instead of clearing `selectionTooltip` in `handleMouseDown`, save the text to a separate ref before clearing. In `handleReplyWithSelection`, read from the ref. Or simpler: use `onMouseDown` with `e.preventDefault()` on the Reply button to prevent the document mousedown from firing.

Actually the cleanest fix: add `onMouseDown={(e) => e.stopPropagation()}` on the Reply button/tooltip div to prevent the document-level mousedown handler from firing.

### `src/components/chat/ChatInput.tsx`
**Rotating upload status messages:**
Add a `useEffect` with interval when `isProcessingFiles` is true that cycles through ["Uploading files...", "Processing documents...", "Extracting text...", "Almost ready..."] every 3 seconds. Display this text on the Send button instead of static "Uploading...".

**Add drag-and-drop to textarea:**
Add `onDragOver`, `onDragLeave`, `onDrop` handlers to the prompt box wrapper div. When files are dropped, call `onFileSelect` with the dropped files. Show a visual overlay when dragging.

### `src/components/chat/MessageBubble.tsx`
**Streaming skeleton:**
When `isStreaming && !isUser && cleanContent.length > 0 && cleanContent.length < 200`, show 2-3 skeleton lines below the current content to indicate more is coming.

**Table rendering fix:**
The tables aren't rendering because the AI sends pipe-delimited table rows without blank lines. Add a preprocessing step to `cleanContent` that detects pipe-table patterns and ensures they have blank lines before/after for remark-gfm to parse them.

### `src/components/chat/StepTracker.tsx`
**Fix collapsed time display:**
The `totalTime` calculation at line ~100 parses `step.duration` as integers from strings like "3s", "72s". This works correctly for single-digit values. The issue is the actual wall clock time. For the collapsed summary, use actual step times. The display shows "15s" but the steps are 72s+58s+54s — this suggests the `duration` field on frozen steps stores the original emitted value. Check if `step.duration` stores the correct string. The `trackStep` function sets duration when marking "done". The issue might be that when restoring from frozen steps, the durations are lost.

Actually the 15s in the screenshot appears to be the collapsed summary from the first message (Henderson, 2 steps). The 72s+58s+54s is from the MFN analysis below. These are separate conversations. The concern is valid though — verify durations are preserved correctly.

### `supabase/functions/llm-router/index.ts`
**Ensure AI generates context-relevant follow-ups, not static choices:**
Update the system prompt to explicitly instruct: "When you need more information from the user, provide 3-4 specific numbered options relevant to the query context. Never use generic category choices."

**Table formatting instruction:**
Add to system prompt: "When outputting markdown tables, always ensure a blank line before and after the table. Each row must be on its own line."

### `src/components/editor/DocumentEditor.tsx`
**Polish:**
- Better heading styles in the Quill editor
- Smoother version transition animations
- Ensure toolbar icons are properly sized

## Summary

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Fix selection reply via stopPropagation on tooltip |
| `src/components/chat/ChatInput.tsx` | Rotating upload text; drag-and-drop file support |
| `src/components/chat/MessageBubble.tsx` | Streaming skeleton; preprocess pipe-tables for blank lines |
| `src/components/chat/StepTracker.tsx` | Verify duration display accuracy |
| `supabase/functions/llm-router/index.ts` | Context-relevant MCQ instruction; table formatting rule |
| `src/components/editor/DocumentEditor.tsx` | Heading/toolbar polish |

