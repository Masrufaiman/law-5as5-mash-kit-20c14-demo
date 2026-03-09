

# Phase 8: Document Panel, Steps Position, Skeleton Loading, Functional Actions

## Issues from Screenshot

1. **Steps position**: "Completed in 2 steps" shows AFTER the AI response. It should show BEFORE — right after the user message, before any AI content starts streaming.
2. **Document in right panel**: AI-generated documents should open in a right-side panel with a Quill.js editor. Only a clickable title link shows under the AI response in the left column.
3. **Skeleton loading**: Show animated skeleton placeholders while waiting for the first token.
4. **Model name showing**: `message.model` renders "gemini-3-flash-preview" next to "LawKit AI". Remove it.
5. **Like/Unlike/Regenerate not functional**: `ResponseActions` buttons are no-ops. Wire them up.
6. **Prompts redirect to new page**: In `Home.tsx`, clicking a prompt template navigates to `/chat`. Instead, it should just set `promptMode` state + show a chip, staying on the same page.

---

## File Changes

### 1. `Chat.tsx` — Steps BEFORE response + skeleton + doc panel toggle

- Move `StepTracker` to render immediately after the user message, BEFORE the assistant message (not after it)
- When `isStreaming` and no assistant content yet, show a `Skeleton` block (3 lines) as a loading placeholder
- Add `editorDoc` state: `{ title, content } | null`. When set, pass it as `rightPanel` to `AppLayout`
- Under each assistant message, if it contains a generated document, show a clickable title that toggles `editorDoc`

### 2. `MessageBubble.tsx` — Remove model name display

- Remove the `message.model` span entirely (lines 32-36)

### 3. `ResponseActions.tsx` — Make buttons functional

- **Like/Unlike**: Save feedback to `messages` table (add `feedback` column check — if not available, store in localStorage and show toast)
- **Regenerate**: Call parent callback `onRegenerate` which re-sends the last user message via `sendMessage`
- **Export**: Download response as `.md` file
- Add `onRegenerate` prop, `messageId` prop

### 4. `Home.tsx` — Prompts stay on page

- Change prompt template `onClick`: instead of navigating, just set `promptMode` state and show a chip badge in the prompt box. The promptMode is sent with the message when user eventually clicks Send.

### 5. `DocumentEditor.tsx` — Replace with Quill.js

- Install `react-quill` (or use `quill` directly)
- Replace the static `contentRef` div with a Quill editor instance
- Full height, full screen in the right panel
- Keep the AI popup on text selection

### 6. `useStreamChat.ts` — Add regenerate support

- Add `regenerateLastMessage` function: removes the last assistant message, re-sends the last user message with same options

---

## Summary

| File | Change |
|------|--------|
| `Chat.tsx` | Steps before response, skeleton loading, right panel doc toggle |
| `MessageBubble.tsx` | Remove model name |
| `ResponseActions.tsx` | Wire like/unlike/regenerate/export |
| `Home.tsx` | Prompts set mode chip instead of navigating |
| `DocumentEditor.tsx` | Replace with Quill.js rich text editor |
| `useStreamChat.ts` | Add regenerate function |

