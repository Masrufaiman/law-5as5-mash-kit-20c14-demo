

# Plan: 12-Issue Fix — GenUI, Share, Upload UX, Send Button, Steps, Follow-ups, Scroll, Feedback, Sidebar, Sheet Edits

## Issues & Fixes

### 1. GenUI — Ask user if they have doubts
Already working via `FollowUpSuggestions` and `ChoiceCards`. The AI's system prompt already requests follow-ups. No change needed.

### 2. Share vault: multiple emails (comma/Enter)
**`VaultDetail.tsx`** — Update `handleShare` to split `shareEmail` by commas and newlines, trim each, and insert all valid emails in a loop. Show count of shared emails in toast.

### 3. Upload skeleton + sidebar vault names on delete/rename
**`Vault.tsx`** — After `handleUpload` is called, immediately show skeleton/spinner for each file BEFORE the actual upload starts. Currently `uploadProgress` is only set inside `uploadSingleFile` after the function is called, but `Promise.allSettled` batching causes a delay.
Fix: Set `uploadProgress` entries for ALL files at the start of `handleUpload`, before the batch loop.

**`NavigationSidebar.tsx`** — Sidebar loads vaults once on mount (`useEffect` with `profile.organization_id`). On delete/rename in `Vault.tsx`, the sidebar's `vaults` state is stale. Fix: Add a Supabase realtime subscription on `vaults` table in NavigationSidebar, OR use a custom event / shared state. Simplest: subscribe to `postgres_changes` on `vaults` table filtered by org_id.

### 4. Send button not working in chat details page
**`Chat.tsx`** line 706-707: `onSend={handleSend}` is called with no args. `handleSend` uses `input` state. But `handleSend` calls `sendMessage` which requires `organizationId`. When loading a conversation via URL (`?id=`), the `profile` might not be loaded yet — but the button is only `disabled={isStreaming}`, not checking `!profile`. However, `handleSend` already checks `!profile?.organization_id` and shows a toast. The real issue: `handleSend` on line 290 checks `if (!msg || isStreaming)` — if `input` is empty, it returns early silently. But the Send button is already `disabled={!value.trim()}` in ChatInput. So the button should be disabled when empty...

Actually, looking more carefully: the Send button `disabled={disabled || !value.trim()}` where `disabled={isStreaming}`. So if value is non-empty and not streaming, the button should work. The issue may be that `handleSend` is called but `conversationId` is already set (loaded from URL), so it goes to the `else` branch (line 300-315) which calls `sendMessage` with the existing `conversationId`. This should work.

Wait — `handleSend` is NOT wrapped in `useCallback`. Every render creates a new function. But `ChatInput`'s `onSend` is just `handleSend`, so it should always be the latest closure. Let me check if the `handleChoiceSelect` callback's dependencies are stale — line 318-320 uses `useCallback` but its deps list doesn't include `handleSend`. But this is for choice selection, not the send button.

The real bug: `handleSend` at line 289 does `const msg = (text || input).trim()`. When called from the Send button click (line 419 in ChatInput), it calls `onSend()` which is `handleSend()` with no args. So `text` is undefined, and `input` is the Chat.tsx state. This should work if `input` has a value... 

Unless: when the chat is loaded from URL, `profile` is loading, the user types, but `profile.organization_id` is null. The toast fires but the user may not notice. Better: also disable the Send button when profile is loading.

Fix: Pass `disabled={isStreaming || !profile?.organization_id}` to ChatInput.

### 5. Image 2 (GenUI error) — Follow-ups shown as raw text
**`MessageBubble.tsx`** — The image shows `FOLLOWUP: Would you like...FOLLOWUP: Are there...FOLLOWUP: Do you require...` displayed as plain text instead of being parsed into `FollowUpSuggestions`. This means the `>>FOLLOWUP:` pattern isn't being stripped from `cleanContent` and the follow-ups aren't being extracted.

Looking at `useStreamChat.ts` line 283-298: follow-ups are set from `parsed.followUps` in the `done` event. The backend (`llm-router`) needs to parse `>>FOLLOWUP:` lines from the response and send them in the done event. If the backend isn't doing this, the follow-ups appear as raw text.

Fix in `MessageBubble.tsx`: Add client-side follow-up extraction as a fallback. If `message.followUps` is empty, parse `cleanContent` for `FOLLOWUP:` lines, extract them, and strip them from the displayed content.

### 6. Image 3 — New doc instead of version 2
The image shows the AI generated a new document card after the user provided additional details (name, date). The `draftingModePrompt` already says to generate a complete document, and `currentDocumentContent` is passed. But the prompt doesn't instruct the AI to UPDATE the existing document — it just says "generate a complete document."

Fix in `llm-router/index.ts`: When `currentDocumentContent` is present AND `effectiveMode === "drafting"`, add explicit instructions: "The user has an existing document open. Modify the existing document with the requested changes. Do NOT create a new document from scratch."

### 7. Image 4 — Plan steps not all ticked
The image shows plan steps (Analyze query, Draft legal document, Synthesize response) with empty circles while the actual steps below (Analyzing your query, Synthesizing response) have green checks. The `isPlanStepDone` function (StepTracker line 23-31) does fuzzy matching but it's failing because "Draft legal document" doesn't match any completed step name like "Analyzing your query" or "Synthesizing response".

Fix in `StepTracker.tsx`: When `allDone && !isStreaming`, mark ALL plan steps as done regardless of fuzzy matching, since the entire process has completed.

### 8. Follow-up questions hidden when selecting one
**`MessageBubble.tsx` line 303**: `followUpSection` is only rendered when `isLastAssistant`. When user clicks a follow-up, a new user message is sent, making the previous assistant message no longer `isLastAssistant`, so follow-ups disappear.

Fix: Always render follow-ups for assistant messages that have them, but only make them clickable when `isLastAssistant`. When not last, show them in a disabled/muted state.

### 9. Scroll to top when toggling file open/close
**`Chat.tsx`** `handleDocumentOpen` (line 322-333) already saves and restores scroll position via `requestAnimationFrame`. But the `ScrollArea` ref (`scrollContainerRef`) is cast with `as any` (line 591). The scroll position restoration may not work because `ScrollArea` doesn't expose `scrollTop` directly — the actual scrollable element is a child viewport.

Fix: Use `scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]')` to get the actual scrollable element for saving/restoring scroll position.

### 10. Admin panel: show full question + response for feedback
**`FeedbackTab.tsx`** — Currently only shows conversation title and user email. Need to load the actual message content (the message that was liked/disliked) and the preceding user question.

Fix: After loading feedback items, also load the message content and the preceding user message for each feedback item. Display them in an expandable section.

### 11. Promptbox uploaded files not processed (OCR, embed, etc.)
Files attached via `@mention` in ChatInput are tracked as `mentionedFiles` but only their names are shown as badges. They're not uploaded/processed like vault files. The `@mention` references existing vault files, so they should already be processed.

But if the user uploads files directly (not via @mention but via a file input), those files aren't processed at all. Currently there's no file upload input in the prompt box — only @mention for existing vault files. So either: (a) the user expects @mentioned vault files to provide context — they should, since the backend does RAG lookup on the vault, or (b) the user wants to upload NEW files from the prompt box.

Fix: The mentionedFiles' IDs should be passed as `attachedFileIds` to `sendMessage` so the backend can use them for targeted RAG lookup. Currently `ChatInput` tracks `mentionedFiles` but doesn't pass them back to `Chat.tsx`.

Fix in `ChatInput.tsx`: Add a callback prop `onMentionedFilesChange` that reports `mentionedFiles` to the parent.
Fix in `Chat.tsx`: Track mentioned files and pass them as `attachedFileIds`/`attachedFileNames` to the send options.

### 12. AI column fill + table column add + show edits in sheet
**Column fill**: The `fillColumnWithAI` function (SheetEditor line 123) calls the llm-router with `useCase: "column_fill"`. The backend code (line 180-282) looks correct — it loads file content. The issue may be that the response isn't being parsed correctly, or the `resp.ok` check fails because the response is SSE streamed instead of JSON.

Looking at the code: the column_fill use case returns a regular JSON response (`new Response(JSON.stringify({ values }))`), not a stream. But the fetch in SheetEditor doesn't include an auth token (line 132-148 — no Authorization header!). 

Fix: Add the auth token to the `fillColumnWithAI` fetch request.

**Show edits**: The code at line 252 checks `showEdits && currentVersion > 0` for `prevVersion`. The diff rendering (lines 439-448) shows strikethrough old + highlighted new. This should work if `showEdits` is toggled and there are 2+ versions. If the button is disabled at `currentVersion === 0` (line 305), the user needs at least version 2. The issue might be that after AI fill, the data updates but no new version is saved, so `currentVersion` stays at 0. Fix: auto-save a version after AI fill.

## Files Modified

| File | Changes |
|------|---------|
| `VaultDetail.tsx` | Split share emails by comma/Enter |
| `Vault.tsx` | Show upload skeleton immediately for all files |
| `NavigationSidebar.tsx` | Realtime subscription on vaults table for sidebar updates |
| `Chat.tsx` | Disable send when no profile, pass mentionedFiles as attachedFileIds, fix scroll restore |
| `ChatInput.tsx` | Add onMentionedFilesChange callback |
| `MessageBubble.tsx` | Client-side FOLLOWUP extraction fallback, always show follow-ups (disabled for non-last) |
| `StepTracker.tsx` | Mark all plan steps done when allDone |
| `FeedbackTab.tsx` | Load and display message content + user question |
| `SheetEditor.tsx` | Add auth header to column fill, auto-save version after AI fill |
| `llm-router/index.ts` | Add document update instructions when currentDocumentContent present |

