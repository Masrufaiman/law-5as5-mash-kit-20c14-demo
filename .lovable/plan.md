

# Plan: Doc Streaming, State Persistence, Auto-Fold Steps, Sheet Edits, Vault Sharing

## Issues & Changes

### 1. Stream Doc Text to Right Sidebar, Not Chat
**Problem**: When AI generates a document (detected via `detectDocument`), the full text appears in chat AND as a card. Should stream directly into the editor panel.
**Fix in `Chat.tsx`**: When streaming tokens arrive and the content looks like a document (starts with `# Title`), auto-open the `DocumentEditor` in the right panel with the streaming content. Suppress the markdown render in `MessageBubble` — show only the card.
**Fix in `MessageBubble.tsx`**: When a doc is detected, don't render `markdownContent` at all — only the card. Already partially done but the streaming text still shows before detection kicks in. Add early detection during streaming by checking the first few tokens.

### 2. Persist Tags & Prompt Text Across Navigation
**Problem**: When navigating to another page, `selectedVault`, `activeSources`, `promptMode`, `workflowTag`, and `message` text in Home.tsx are reset because they're local state.
**Fix**: Store these in `sessionStorage` (not localStorage — session-scoped). On mount, read from sessionStorage. On change, write to sessionStorage. Apply to both `Home.tsx` and `Chat.tsx`.

### 3. Auto-Fold Steps After Completion
**Problem**: Steps stay expanded after work is done.
**Fix in `StepTracker.tsx`**: Add a `collapsed` state that defaults to `true` when `allDone && !isStreaming`. When collapsed, show a summary line: "Analyzed in X steps · Ys" with a toggle to expand. When streaming, always show expanded. When stream ends (`allDone`), auto-collapse after 500ms delay.

### 4. Send Button Not Working in Chat Details
**Problem**: The `ChatInput` `onSend` calls `handleSend` in Chat.tsx which checks `!msg || isStreaming || !profile?.organization_id`. The `msg` is `(text || input).trim()` — if `input` is empty string and no `text` is passed, it returns early.
**Fix**: The Send button calls `onSend()` which calls `handleSend()` with no args — this uses `input`. The issue is likely `profile.organization_id` being null when loading a conversation via URL. Add a toast when org is missing so user knows. Also check if `disabled` prop is incorrectly set.

### 5. Show Edits Not Working in Review Sheets
**Problem**: In `SheetEditor`, `showEdits` is toggled but the diff display only shows `prevVal` with strikethrough below the new value. The `changed` check on line 408 compares `prevVal !== val` which should work. But `prevVersion` is only set when `showEdits && currentVersion > 0` (line 252). If there's only one version, the button is disabled — but if there are two versions and user is on version 2, it should show diffs.
**Fix**: The diff rendering shows the old value as strikethrough below the new value (line 439-443). This is correct behavior but it's subtle. Make it more visible: show the old value with red background strikethrough, and the new value with green highlight (like the document editor diff).

### 6. Never Remove Steps — Always Keep Folded
Already handled by the frozen steps system. The `frozenSteps` are stored on each message. Combined with #3 (auto-fold), historical messages will show "Analyzed in X steps" collapsed by default with expand ability.

### 7. Project Files Filter Not Working in Vault
**Problem**: The "Filters" button in `VaultDetail` (line 184-188) is a placeholder — it doesn't do anything.
**Fix**: Add a dropdown with status filters (All, Ready, Processing, Error). Filter `filtered` array by selected status.

### 8. Three Tabs in Vault: All, Yours, Shared with Me
**Problem**: Currently only "All vaults" and "Your vaults" tabs exist in `VaultGrid`.
**Fix**: 
- Create a `vault_shares` table: `id, vault_id, shared_with_email, shared_by, permission (view/edit), created_at`
- Add "Shared with me" tab that queries vaults shared with current user's email
- "General" vaults (no `created_by` or org-wide) show in All
- "Your vaults" filters by `created_by === userId`
- "Shared with me" shows vaults from `vault_shares` where `shared_with_email = user.email`

### 9. Share Vault by Email
**Fix in `VaultDetail.tsx`**: Add a "Share" button that opens a dialog with email input. On submit, insert into `vault_shares` table. The shared user sees it in "Shared with me" tab.

### 10. Harvey-Style Response Rendering
The images show: inline tables mid-response, collapsible step blocks with sub-steps, bold document names as linked chips, structured text with headings + tables + prose in one response.
**Already mostly implemented** via `remark-gfm` tables and `StepTracker`. The auto-fold (#3) and better visual separation will match this closer. The main gap is that Harvey shows tables inline within the response text — which already works with `remark-gfm`. No additional changes needed beyond what's already planned.

---

## Files Modified

| File | Changes |
|------|---------|
| `StepTracker.tsx` | Auto-fold when done, summary line "Analyzed in X steps", expand toggle |
| `Chat.tsx` | Auto-open editor when streaming a doc, persist state in sessionStorage |
| `Home.tsx` | Persist tags/message/vault in sessionStorage across navigation |
| `MessageBubble.tsx` | Suppress full doc text during streaming, show only card |
| `SheetEditor.tsx` | Fix show-edits with proper red/green diff highlighting |
| `VaultGrid.tsx` | Add "Shared with me" tab, query shared vaults |
| `VaultDetail.tsx` | Add share dialog (email input), add status filter dropdown |
| New migration | Create `vault_shares` table with RLS |

