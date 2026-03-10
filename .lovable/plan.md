

# Plan: Workflow Skeleton, File Processing, Steps Persistence, Scrolling, History Search, Dashboard Skeleton

## Issues & Fixes

### 1. Workflows: No default data, show skeleton until loaded
**`Workflows.tsx`**: Currently initializes `workflows` state with `DEFAULT_WORKFLOWS` (line 65). Change initial state to `[]`, add `isLoading` state, show skeleton grid while loading from DB. Only show loaded workflows (no defaults).

### 2. Workflows: Editable title, description, system prompt
**`Workflows.tsx`**: The edit dialog (line 408-438) only edits the system prompt. Expand the edit dialog to include title, description, type, steps, icon, and category fields — similar to the admin panel's workflow editor in `AgentTab.tsx`.

### 3. Sources dropdown & sidebar recent chats can't scroll
**`ChatInput.tsx` line 294**: `ScrollArea` has `max-h-[350px]` which should allow scrolling. The issue is likely that the `PopoverContent` constrains the height. Add `overflow-hidden` to `PopoverContent` so the inner `ScrollArea` handles scrolling correctly.
**`NavigationSidebar.tsx` line 294**: Recent chats `ScrollArea` has `max-h-[280px]` — should scroll. The issue is the parent `nav` element (line 261) has `overflow-y-auto` which may conflict. Remove `overflow-y-auto` from nav and let ScrollArea handle it, or ensure the ScrollArea viewport renders correctly.

### 4. Admin panel: AI workflow builder
**`AgentTab.tsx`**: Add an "AI Build" button next to "Add Workflow" in the workflows tab. Opens the same AI builder dialog as `Workflows.tsx` (describe → AI generates JSON → saves). Reuse the same pattern.

### 5. Steps/thinking/reasoning lost after reload or next conversation
**Root cause**: When loading history from DB (`loadConversation` in Chat.tsx, line 120-137), messages are loaded from the `messages` table which doesn't store `frozenSteps`, `frozenPlan`, `frozenThinkingText`, etc. These are only kept in React state during the session.
**Fix**: Store frozen metadata in the `messages` table. Add a `metadata` column (jsonb) to `messages` table. When a stream completes (`done` event in `useStreamChat.ts`), save the frozen data to the DB alongside the message content. When loading history, restore the frozen fields from the metadata column.

### 6. Follow-up questions lost after reload
Same root cause as #5. Follow-ups need to be persisted in the `metadata` jsonb column alongside `frozenSteps`.

### 7. Vault detail skeleton should look like file list
**`VaultSkeleton.tsx`**: Currently shows a card grid skeleton. When `selectedVaultId` is set (individual vault page), show a file-list-style skeleton instead (rows with icon, name, size, status columns).

### 8. After login: show dashboard skeleton, then onboarding if needed
**`ProtectedRoute.tsx`**: Currently shows "Loading..." text during auth check. Replace with a full dashboard skeleton (sidebar + main content area skeleton). The onboarding redirect already works via `!profile?.organization_id`.

### 9. History: search system
**`History.tsx`**: Add a search input in the header that filters activities by title. Already has `activities` state — just add text filtering.

### 10. Promptbox file upload: full processing pipeline (OCR, embed, chunk, R2)
**Critical issue**: When files are uploaded via the Home/Chat prompt box "Upload files" button, they're stored as `File` objects in local state (`attachedFiles`) but NEVER uploaded to R2, never processed, never OCR'd. The AI has zero context about them.
**Fix**: When files are attached to the prompt box, upload them through the same pipeline as vault uploads:
1. In `Chat.tsx` / `Home.tsx`: When `handleSend` is called with `attachedFiles`, first upload each file to R2 via `r2-upload`, insert into `files` table with status `processing`, trigger `document-processor`, then pass the file IDs as `attachedFileIds` to the LLM router.
2. Create a temporary "prompt_uploads" vault per conversation or use a null vault_id with org-level storage.
3. Wait for processing to complete (or at least start) before sending the message.

## Files Modified

| File | Changes |
|------|---------|
| `Workflows.tsx` | Remove defaults, add loading skeleton, expand edit dialog |
| `ChatInput.tsx` | Fix PopoverContent scroll, add `overflow-hidden` |
| `NavigationSidebar.tsx` | Fix scroll conflict on nav element |
| `AgentTab.tsx` | Add AI workflow builder button + dialog |
| `useStreamChat.ts` | Save frozen metadata to DB on stream complete |
| `Chat.tsx` | Restore frozen metadata when loading history; process attached files through R2/OCR pipeline before sending |
| `Home.tsx` | Process attached files before navigating to chat |
| `VaultSkeleton.tsx` | Add file-list variant for vault detail view |
| `ProtectedRoute.tsx` | Show dashboard skeleton instead of "Loading..." text |
| `History.tsx` | Add search input filtering activities |
| New migration | Add `metadata` jsonb column to `messages` table |

