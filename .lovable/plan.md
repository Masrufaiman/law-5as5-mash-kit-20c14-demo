

# Plan: Fix @Mention, Send Button, Workflows as Tags, Sidebar Cleanup, Vault Simplification

## Issues Found

1. **@mention not showing**: The `MentionDropdown` queries `files` with `vaults!inner(name)` join — if no files have `status: "ready"`, nothing shows. Also the dropdown hides when `files.length === 0`, giving no feedback. The query itself may fail silently due to the join syntax.

2. **Send button not working**: In `ChatInput`, `onSend` is `() => void` but in `Chat.tsx`, `handleSend` checks `!msg || isStreaming || !profile?.organization_id`. If `profile.organization_id` is null/undefined, it silently returns. Need to debug — likely the `handleSend` guard is blocking.

3. **Workflows fill description text instead of adding as tag**: Currently `handleWorkflowClick` navigates to Home with `fillPrompt: wf.description` which sets it as textarea text. Should instead add as a tag/badge (like vaults/sources) and pass the `systemPrompt` to the chat.

## Changes

### 1. Fix @Mention (`MentionDropdown.tsx`)
- Fix the Supabase join query — use explicit foreign key reference if needed
- Show "No files found" message when query returns empty instead of hiding entirely
- Also search vault names, not just file names
- Show files even without "ready" status filter (include "processing" with indicator)

### 2. Fix Send Button (`ChatInput.tsx` + `Chat.tsx`)
- Add error feedback when send fails (e.g., missing org)
- Ensure `onSend` properly triggers — check if the `handleKeyDown` returning early for mentions is interfering
- The issue: when `showMention` is true, `handleKeyDown` returns early on line 101, which means Enter key doesn't work. But clicking Send button should still work since it calls `onSend` directly. Need to verify the `disabled` prop chain.

### 3. Workflows as Tags (`Home.tsx` + `Chat.tsx` + `ChatInput.tsx`)
- Add `selectedWorkflow` state with `{ title, systemPrompt }` 
- Clicking a workflow adds it as a badge/tag in the prompt box (like vault/source badges), not as textarea text
- Pass `systemPrompt` through to `Chat.tsx` → `sendMessage` → `llm-router`
- In `ChatInput.tsx`, add a new prop for workflow tags display and removal

### 4. User Workflows Ownership (`Workflows.tsx`)
- Add `created_by` field to workflow items stored in `agent_config`
- Filter: "All Workflows" / "My Workflows" toggle
- User can only edit/delete their own workflows
- Edit dialog: allow changing system prompt
- Admin panel: show "Created by [user]" tag on user-created workflows

### 5. Remove Documents & Library from Sidebar (`NavigationSidebar.tsx`)
- Remove `Documents` and `Library` from `bottomNav` array (lines 184, 187)

### 6. Recent Chats: Limit to 10 with Scroll (`NavigationSidebar.tsx`)
- Already fetches 20 (line 100). Change to show first 10 inline, rest accessible via scroll
- The `ScrollArea` with `max-h-[320px]` already exists — just slice `recentChats` to first 10 for display, keep scroll for overflow

### 7. Vault Simplification (`VaultDetail.tsx`)
- Remove "Create new query" section (lines 159-193, the workflow cards)
- Remove "AI Prompt bar" section (lines 195-205)
- Remove "Create folder" button
- Add file click → popup preview (Dialog showing file name, metadata, download link)

### 8. Bulk Upload Progress (`Vault.tsx`)
- Show per-file upload skeleton/progress indicator
- Track upload state per file (uploading → processing → ready)
- Use parallel uploads with `Promise.allSettled` 
- Show toast per file or a batch progress indicator

## Files Modified

| File | Changes |
|------|---------|
| `MentionDropdown.tsx` | Fix query, show empty state, broader search |
| `ChatInput.tsx` | Add workflow tag display, fix send interaction |
| `Chat.tsx` | Pass workflow systemPrompt to sendMessage |
| `Home.tsx` | Workflow click adds tag instead of text |
| `Workflows.tsx` | Add created_by, edit prompt, "My Workflows" filter |
| `NavigationSidebar.tsx` | Remove Documents/Library, limit chats to 10 |
| `VaultDetail.tsx` | Remove AI bar, workflows, add file preview popup |
| `FileTable.tsx` | Add onClick handler for file preview |
| `Vault.tsx` | Parallel upload with per-file progress |

