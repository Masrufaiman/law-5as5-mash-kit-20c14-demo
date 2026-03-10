

# Plan: Multi-Issue Fix — Steps Persistence, Versioning, Feedback, 404, Sidebar, Editor, Diff, File Uploads, Memory

## Issues Identified

1. **Steps/thinking disappear after new message** — Steps, plan, thinkingText are reset in `sendMessage` (line 83-88 of useStreamChat). When a new user message is sent, `setSteps([])`, `setPlan([])`, `setThinkingText("")` clear everything. The steps are only rendered on the LAST assistant message (`showSteps = msg.role === "assistant" && i === messages.length - 1`). Previous messages lose their steps entirely.

2. **AI creates new document instead of editing** — No versioning in the document flow. When user asks to modify, AI generates a brand new doc. The existing document content isn't sent back to the AI as context.

3. **No export in DocumentEditor** — Missing download/export buttons.

4. **No Versions/Show Edits buttons beside Save** — Already partially implemented but diff shows wrong version (shows prev instead of strikethrough+new).

5. **Thumbs up/down stored in localStorage only** — Not persisted to DB, not visible in admin panel.

6. **404 page is basic** — Needs a polished design.

7. **Documents/Library still in sidebar/history** — `Documents` filter still in History page FILTERS array. Sidebar already fixed.

8. **Search (⌘K) doesn't show all recent chats scrollable** — Currently only shows search results, not recent chats when empty.

9. **More fonts in Quill editor** — Only default `{ font: [] }` which gives limited options.

10. **Show Edits diff shows old version, should show strikethrough-old + highlight-new** — The `computeDiff` already does this but the diff view replaces the editor entirely. Need to verify it shows both deletions and additions correctly.

11. **Uploaded files in promptbox not used/shown in chat** — Files uploaded via prompt are not passed to `sendMessage` and not shown in chat details.

12. **AI forgets vault context between messages** — The `history` array sent to backend only contains `{ role, content }` — no vault context. The AI's first message mentions vault access but subsequent messages don't include the vault context because only `message` (the latest) gets vault/RAG lookup.

## Changes

### 1. Persist Steps Per Message (`useStreamChat.ts` + `MessageBubble.tsx` + `Chat.tsx`)
- Store steps, plan, thinkingText, searchSources, fileRefs ON the ChatMessage object itself (extend the interface)
- When streaming completes (type "done"), freeze the current steps/plan/thinking onto the last assistant message
- In `MessageBubble`, read steps from `message.steps` instead of external props for non-streaming messages
- Only pass live steps for the currently-streaming message

### 2. Send Current Document to AI for Edits (`Chat.tsx` + `llm-router`)
- When `editorDoc` exists, pass its content as `currentDocumentContent` in sendMessage options
- In llm-router, when `currentDocumentContent` is present, include it in the system prompt: "The user has an open document. When they ask for changes, modify ONLY the changed parts. Output the complete updated document."
- Add `currentDocumentContent` to `useStreamChat` options interface

### 3. Export in DocumentEditor (`DocumentEditor.tsx`)
- Add Download button (export as .docx-compatible HTML or .md)
- Add alongside Save button

### 4. Fix Diff View (`DocumentEditor.tsx`)
- The `computeDiff` already produces `<span style="text-decoration: line-through; color: red">old</span>` and `<span style="background: green">new</span>`. Verify it compares `versions[currentVersion - 1]` vs `versions[currentVersion]`. This is correct — the issue may be that "Show edits" button is comparing wrong versions. Ensure it always compares current version against previous version and shows both deletions AND additions inline.

### 5. Thumbs Up/Down to Supabase (`ResponseActions.tsx`)
- Create a `message_feedback` table: `id, message_id, conversation_id, organization_id, user_id, feedback (up/down), created_at`
- Save feedback to Supabase alongside localStorage
- Create admin panel tab to view feedback

### 6. New 404 Page (`NotFound.tsx`)
- Modern design with LawKit branding, animated illustration, search bar, quick links

### 7. Remove Documents from History Filters (`History.tsx`)
- Remove "Documents" from FILTERS array
- Remove document loading from `loadActivities`

### 8. Search Shows Recent Chats (`NavigationSidebar.tsx`)
- When search query is empty, show all recent chats (scrollable) instead of empty state
- Show "Recent conversations" header with scrollable list

### 9. More Fonts in Quill (`DocumentEditor.tsx`)
- Register custom fonts with Quill: 'serif', 'sans-serif', 'monospace', 'Inter', 'Georgia', 'Times New Roman', 'Courier New', 'Garamond', 'Palatino'
- Use Quill.register to add font whitelist

### 10. File Uploads in Chat (`ChatInput.tsx` + `Chat.tsx` + `useStreamChat.ts`)
- Currently `mentionedFiles` from `@mention` are tracked but not passed to `onSend`
- Add `onSendWithFiles` callback that passes `mentionedFiles` to `handleSend`
- In `Chat.tsx`, pass file IDs as `attachedFileIds` and names as `attachedFileNames` to `sendMessage`
- Show file attachments in user message via existing `AttachmentBadges`

### 11. AI Remembers Vault Context (`llm-router/index.ts`)
- The backend already does RAG lookup for each message using `vaultId`. The issue is that when the AI says "I have access to documents" in message 1, the next query also gets vault context via RAG. But if the RAG returns no results for the second query, the AI has no document context.
- Fix: when vault is set, ALWAYS load at least a file listing (names + brief excerpt) so the AI knows what files exist even if RAG returns no matches.
- Add a lightweight vault inventory step: query file names from the vault and include them in system prompt.

### 12. DB Migration for message_feedback
- New table `message_feedback` with RLS policies

## Files Modified

| File | Changes |
|------|---------|
| `useStreamChat.ts` | Extend ChatMessage with steps/plan/thinking; freeze on "done"; add currentDocumentContent option |
| `MessageBubble.tsx` | Read steps from message object for non-streaming messages |
| `Chat.tsx` | Pass editorDoc content, pass mentionedFiles, freeze steps onto messages |
| `ChatInput.tsx` | Pass mentionedFiles with onSend |
| `DocumentEditor.tsx` | Add export button, more fonts, verify diff |
| `ResponseActions.tsx` | Save feedback to Supabase |
| `NotFound.tsx` | Complete redesign |
| `History.tsx` | Remove Documents filter |
| `NavigationSidebar.tsx` | Show recent chats in search when empty |
| `llm-router/index.ts` | Add vault file inventory, accept currentDocumentContent |
| New migration | Create `message_feedback` table |
| Admin panel | Add feedback viewer tab |

