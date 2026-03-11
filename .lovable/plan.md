

# Plan: Six Fixes for Chat UX and Backend Behavior

## Issues Identified

1. **Sources footer outside reasoning** — `SourcesFooter` renders below the message content, outside the `StepTracker` collapsible. It should be inside the reasoning/steps block.

2. **Right panel too narrow** — `AppLayout` sets `defaultSize={45}` for right panel and `defaultSize={70}` for left. The right panel should be larger by default (55%) with the chat side smaller.

3. **Follow-up questions not showing** — Need to ensure follow-ups appear in all modes (chat, draft, review, red_flags). The backend system prompt should instruct the LLM to always generate follow-ups.

4. **Uploads vault leak on subsequent messages** — When `vaultId` points to the "Uploads" vault and the user sends a follow-up message, `handleSend` passes `vaultId` without `attachedFileIds`. The backend then searches ALL files in the Uploads vault (every file ever uploaded via prompt). Fix: for the Uploads vault specifically, only use `attachedFileIds` from the original message, not the whole vault.

5. **Clicking source file name should open file in right panel** — Doc-source citations with file IDs should be clickable to open the file content in the right-side editor.

6. **Clicking document card opens reasoning section** — `handleDocumentOpen` toggles the `editorDoc` state, which changes `rightPanel`, which triggers re-render. The `StepTracker` has an auto-collapse effect tied to `isStreaming`, but on re-render the collapsed state resets. Fix: ensure `StepTracker` collapsed state is stable across parent re-renders.

## Implementation

### 1. Move SourcesFooter inside StepTracker
- Pass `citations` to `StepTracker` as a new prop
- Render the sources section (the expandable "Sources — N cited" block) inside the StepTracker component, below the file refs
- Remove `sourcesFooter` from `MessageBubble` (all render paths)

### 2. Fix right panel sizing in AppLayout
- Change left panel `defaultSize` from 70 to 45, `minSize` from 30 to 25
- Change right panel `defaultSize` from 45 to 55

### 3. Ensure follow-ups in all modes
- This is primarily a backend/system-prompt concern. The `llm-router` already emits follow-ups in the `done` event. Verify the system prompt instructs follow-up generation regardless of `promptMode`. Add explicit instruction in the base system prompt.

### 4. Fix Uploads vault scoping
- In `Chat.tsx`, track `attachedFileIds` at the conversation level (store in state after first send)
- On subsequent sends, if the vault is "Uploads", pass the stored `attachedFileIds` so the backend only searches those specific files, not the entire Uploads vault
- In `llm-router`, when `vaultName === "Uploads"` and no `attachedFileIds` provided, skip vault search (don't search the whole Uploads vault)

### 5. Source file click → open in right panel
- In `SourcesFooter`, make doc-source items clickable
- Add `onFileClick` callback prop that passes file name/id up
- In `MessageBubble`, wire `onFileClick` to fetch file content and call `onDocumentOpen`
- In `StepTracker` (since sources move there), add the same `onFileClick` prop

### 6. Fix reasoning section reopening on document click
- The bug: `StepTracker` uses `useState(false)` for `collapsed`, and when `editorDoc` changes, the parent re-renders but `StepTracker` keeps its state (same key). However, the `useEffect` that auto-collapses after 800ms fires again. The real issue is that clicking the document card causes a state change that makes `stepsSection` re-evaluate its condition, potentially creating a new `StepTracker` instance.
- Fix: Use a stable `key` on the StepTracker based on `message.id` so it preserves collapsed state. Also ensure `handleDocumentOpen` doesn't trigger unnecessary re-evaluation of `stepsSection`.

## Files Modified

| File | Changes |
|------|---------|
| `src/components/AppLayout.tsx` | Swap panel default sizes (45/55) |
| `src/components/chat/StepTracker.tsx` | Add `citations` and `onFileClick` props, render sources section inside |
| `src/components/chat/MessageBubble.tsx` | Remove `sourcesFooter` from all render paths, pass citations to StepTracker, add stable key |
| `src/pages/Chat.tsx` | Track `attachedFileIds` in state, pass to subsequent sends for Uploads vault, wire file click to open in right panel |
| `supabase/functions/llm-router/index.ts` | Skip full Uploads vault search when no `attachedFileIds`; ensure follow-up generation in system prompt for all modes |

