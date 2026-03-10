

# Fix Plan: Vault Management, Vector Search, Sidebar, Editor Versions, Reply Tooltip, Sources Scroll, and Generative UI

## Issues Identified

1. **Vault "All vaults" / "Your vaults" filter not working** — `VaultGrid` has `tab` state but never filters by it. The `filtered` array only checks search text, ignoring the tab.

2. **Vault edit/delete missing** — No UI to rename or delete a vault. Deleting should also remove files from DB and Qdrant vectors.

3. **Vector search always fails** — The `llm-router` emits "Document search unavailable" or similar steps. Need to check: the collection name format may not match what `document-processor` creates, or the Qdrant config may be missing/misconfigured. The step text is visible in the reasoning/steps area — should show a friendlier message and handle gracefully.

4. **Sidebar missing Rename icon on hover** — Currently shows Share and Delete on hover, but no Rename.

5. **"Show edits" / document versioning** — Editor has no version tracking or track-changes display. Image shows strikethrough (red) for removed text and highlighted new text. Need version system.

6. **Reply tooltip adds selected text to prompt** — Already implemented in `Chat.tsx` (lines 152-213). Need to verify it works — the tooltip appears on text selection within assistant messages and prepends quoted text to input.

7. **Sources dropdown not scrollable** — In `ChatInput.tsx`, there's no Sources dropdown (it's only on Home.tsx). Home.tsx already wraps in `ScrollArea` with `max-h-[400px]`. ChatInput needs a Sources button with scrollable dropdown too.

8. **Console error** — Badge component ref warning in Settings page.

9. **Generative UI for user interactions** — Already implemented (ChoiceCards, MultiStepQuestionnaire). The system prompt already instructs the AI to use numbered bold choices. This is working.

---

## File Changes

### 1. `src/components/vault/VaultGrid.tsx` — Fix tab filter + add edit/delete

- Filter vaults by `tab`: when `tab === "yours"`, filter by `created_by === currentUserId`
- Accept `userId` prop to enable filtering
- Add hover actions (edit name, delete) on each vault card
- Add `onDeleteVault` and `onRenameVault` callbacks

### 2. `src/pages/Vault.tsx` — Add delete/rename handlers

- `handleDeleteVault`: delete all files from DB, delete Qdrant vectors via a new edge function call or direct cleanup, delete the vault record, update state
- `handleRenameVault`: update vault name in DB, update state
- Pass `userId` (profile.id) to VaultGrid

### 3. `src/components/vault/VaultDetail.tsx` — Add vault header edit/delete

- Make vault name editable inline (like conversation title)
- Add delete button in header

### 4. `src/components/NavigationSidebar.tsx` — Add Rename icon on hover

- Add a Pencil/Rename icon next to Share and Delete for each recent chat
- On click, show inline rename input or dialog
- Save renamed title to DB

### 5. `src/components/editor/DocumentEditor.tsx` — Add "Show edits" and versioning

- Track versions: store initial content as version 1, each save creates a new version
- "Show edits" toggle: when enabled, diff the current version against previous version and render with strikethrough (red) for deletions and highlight for additions
- "Version N" indicator in toolbar header
- Use a simple diff algorithm (word-level) to highlight changes

### 6. `src/components/chat/ChatInput.tsx` — Add Sources dropdown (scrollable)

- Add a Sources button similar to Home.tsx that opens a scrollable popover with vaults, jurisdictions, etc.
- Accept `vaults`, `activeSources`, `onSourceToggle`, `selectedVault`, `onVaultSelect` props
- Wrap content in ScrollArea

### 7. `supabase/functions/llm-router/index.ts` — Improve vector search error handling

- When Qdrant search fails, log the actual error but show a user-friendly step like "Reading documents directly" instead of exposing "Vector search failed"
- Ensure fallback path always triggers when vector search is unavailable

### 8. `src/pages/Settings.tsx` — Fix Badge ref warning

- The Badge component doesn't use forwardRef. Either wrap Badge with forwardRef or remove the ref being passed.

---

## Files Modified

| File | Changes |
|------|---------|
| `VaultGrid.tsx` | Filter by "yours" tab, add hover edit/delete actions |
| `VaultDetail.tsx` | Inline vault rename, delete button in header |
| `Vault.tsx` | Add delete/rename vault handlers with DB + vector cleanup |
| `NavigationSidebar.tsx` | Add Rename icon on hover for recent chats |
| `DocumentEditor.tsx` | Version tracking, "Show edits" with diff highlighting |
| `ChatInput.tsx` | Add Sources dropdown with ScrollArea |
| `llm-router/index.ts` | Friendlier vector search error steps |

