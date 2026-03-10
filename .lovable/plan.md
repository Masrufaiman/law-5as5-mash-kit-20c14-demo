

# Plan: Review-as-Mode, Sidebar Cleanup, Admin Scoping & Workflow Fix

## Summary

1. Remove "Review" from the sidebar nav
2. Add "Review Table" as a prompt mode (alongside Chat, Draft, Red Flag) — the AI creates a spreadsheet in the right panel like documents
3. Workflow clicks fill the prompt box instead of navigating
4. Admin panel scoped to org-level access (vault/chat sharing, not full org access)

---

## 1. Remove Review from Sidebar

**File: `src/components/NavigationSidebar.tsx`**

Remove `{ icon: Table2, label: "Review", path: "/review" }` from `bottomNav` array (line 184). Keep the `/review` route in `App.tsx` for direct access but hide from sidebar.

## 2. Add "Review Table" as a Prompt Mode

**File: `src/components/chat/ChatInput.tsx`**

Add a 4th mode to `PROMPT_MODES`:
```
{ id: "review", label: "Review Table", description: "Extract structured data from documents into a spreadsheet", icon: Table2 }
```

**File: `src/pages/Home.tsx`**

Add same mode to the mode selector in Home page toolbar (lines ~525-545).

## 3. Sheet Editor Component (Right Panel)

**New file: `src/components/editor/SheetEditor.tsx`**

A right-panel spreadsheet editor similar to `DocumentEditor.tsx`:
- Props: `title`, `columns` (name + type), `rows` (2D data), `onClose`
- Renders an editable HTML table with:
  - Column headers (name, type badge like the reference image: "Free response", "Date", "Classification", "Verbatim")
  - Rows with file names in first column, extracted values in subsequent columns
  - Status badge per row (pending/completed)
- **Versioning**: Same version system as DocumentEditor — saves versions, "Show edits" toggle with cell-level diff highlighting
- **Column Builder Dialog**: A button "Add columns" opens a dialog with:
  - A textarea for natural language description of what to extract
  - "Generate columns" button that calls the AI to suggest columns
  - Table showing generated columns (Type, Column header, Query) with edit/delete per row
  - "Add columns" button to confirm
- Toolbar: version indicator, show edits, save, close

## 4. AI Integration for Review Mode

**File: `supabase/functions/llm-router/index.ts`**

When `useCase === "review"`:
- System prompt instructs AI to analyze the selected vault/files and produce structured extraction output
- Output format: a special markdown table or JSON block that the frontend detects (similar to `# Document Title` pattern for docs)
- Pattern: AI outputs `<!-- SHEET: Title -->` followed by a JSON block with `{ columns: [...], rows: [...] }` which triggers the SheetEditor in the right panel

**File: `src/components/chat/MessageBubble.tsx`**

Detect the `<!-- SHEET: ... -->` pattern in assistant messages and call `onSheetOpen` (similar to `onDocumentOpen`).

**File: `src/pages/Chat.tsx`**

- Add `sheetDoc` state (like `editorDoc`) to hold the active sheet data
- Pass `SheetEditor` as `rightPanel` when sheet data is present (priority: sheet > document)
- Handle `onSheetOpen` from MessageBubble

## 5. Workflow Click → Fill Prompt Box (Don't Navigate)

**File: `src/pages/Home.tsx`** (lines 606-614)

Change workflow click handler from:
```js
navigate("/chat", { state: { initialMessage: wf.description, ... } });
```
to:
```js
setMessage(wf.description);
```

This fills the prompt box so the user can edit before sending.

## 6. Admin Panel — Org Admin Access Control (Vault/Chat Sharing)

The admin panel stays for config (LLM, Search, Storage, Knowledge, Agent). Org admins can additionally share specific vaults/chats with users via the Settings page or inline. No full org access management — just granular vault/chat access.

**File: `src/pages/Settings.tsx`**

Add an "Access Control" section for org admins:
- Shows list of org users
- Per-user: checkboxes for which vaults and chats they can access
- Uses a `user_access` table or the existing `invitations` approach

This is a lighter touch than full org management — org creator is admin by default, can grant access to specific resources.

*Note: The database migration for access control can be done separately as it requires careful RLS design. For now, the UI will be built to prepare for it.*

---

## Files Modified

| File | Changes |
|------|---------|
| `NavigationSidebar.tsx` | Remove "Review" from bottomNav |
| `ChatInput.tsx` | Add "Review Table" prompt mode |
| `Home.tsx` | Add review mode, workflow click fills prompt box |
| New `SheetEditor.tsx` | Spreadsheet editor with versioning, column builder |
| `Chat.tsx` | Handle sheet data in right panel |
| `MessageBubble.tsx` | Detect sheet output pattern |
| `llm-router/index.ts` | Review mode system prompt |

