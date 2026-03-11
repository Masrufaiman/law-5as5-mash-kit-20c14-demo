
Plan: Remove @-reference UI, fix Add Column validation, and make steps/thinking/reasoning/follow-ups persist correctly

What I found
- The `@` reference feature is fully wired inside `src/components/chat/ChatInput.tsx` through `MentionDropdown`, `mentionedFiles`, `showMention`, and the “Type @ to reference a file” placeholder.
- The Add Column confirm button is only disabled by this condition in `SheetEditor`: `!name.trim() || existingColumns.includes(name.trim())`. So the current UX silently blocks the action with no explanation, and it does not normalize names or handle version/read-only edge cases.
- The persistence bug is real:
  - `Chat.tsx` correctly loads frozen metadata from `messages.metadata`.
  - But recent assistant rows are still coming back with `metadata: {}`.
  - In `llm-router`, `frozenThinkingText` is currently populated from `reasoningContent`, which is the wrong field.
  - `reasoning` itself is not persisted/restored at all, so internal reasoning is guaranteed to disappear after reload.
  - `useStreamChat` resets live steps/thinking on every new send, so old messages can only keep them if frozen metadata exists.

Implementation
1. Remove the `@` reference-file feature from the prompt box
- Update `src/components/chat/ChatInput.tsx` to remove:
  - `MentionDropdown` import/render
  - mention-related state and handlers
  - mentioned file chips
  - `@` detection logic in textarea change handler
  - placeholder text mentioning `@`
- Keep real file upload/attachment behavior unchanged.
- Clean up `src/components/chat/MentionDropdown.tsx` if it becomes unused.

2. Fix the Add Column flow so it is never “mysteriously disabled”
- Update `src/components/editor/SheetEditor.tsx`:
  - normalize duplicate checks with trim + case-insensitive comparison
  - show an inline validation message when blocked instead of only disabling the button
  - ensure the dialog uses the current editable sheet state, not a stale/older snapshot
  - if the sheet is on an older version, either switch to latest before adding or clearly show why add/edit actions are blocked
- Result: valid new column names will be addable reliably, and invalid cases will be explicit.

3. Fix persistence of steps, thinking, reasoning, file refs, sources, and follow-ups
- Update `supabase/functions/llm-router/index.ts` to build metadata from the actual streamed state:
  - persist `frozenSteps`
  - persist `frozenPlan`
  - persist visible thinking text from `emitThinking(...)`
  - persist internal reasoning separately
  - persist `frozenSearchSources`
  - persist `frozenFileRefs`
  - persist `followUps`
- Do not store visible thinking inside the reasoning field or vice versa.
- Update `src/hooks/useStreamChat.ts` so the frozen in-memory message shape matches what the backend persists.
- Update `src/pages/Chat.tsx` to restore all persisted fields when loading history, including `reasoning`.
- If needed, add `frozenReasoning` to the message metadata contract and map it back onto `message.reasoning` during history load.

Files to update
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/MentionDropdown.tsx` (cleanup/remove if unused)
- `src/components/editor/SheetEditor.tsx`
- `src/hooks/useStreamChat.ts`
- `src/pages/Chat.tsx`
- `supabase/functions/llm-router/index.ts`

Technical notes
- No new table is required; `messages.metadata` already exists.
- The core persistence bug is not only frontend state reset; it is that the backend is still not saving the correct metadata payload for assistant messages.
- Existing older assistant messages that were already saved with empty metadata cannot fully recover steps/reasoning unless that data still exists in message content. The fix will make new and future responses persist correctly.