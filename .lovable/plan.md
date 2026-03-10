

# Plan: Workflows Page, History Logs, Sheet Improvements, Versioning System, and Streaming Fix

## 1. Workflows Page (Harvey-style)

**New file: `src/pages/Workflows.tsx`**

A dedicated page (like the reference image) showing all workflows grouped by category (Litigation, Transactional, Financial Services). Each card shows title, description, output type badge ("Review", "Draft", "Output"), step count, and an icon. Cards loaded from admin `agent_config` workflows.

- "+ Create workflow" button opens a dialog where the user describes what they want in natural language. On submit, calls `llm-router` with a special `useCase: "workflow_builder"` that returns a structured workflow JSON (title, description, type, steps, icon, systemPrompt). The result is saved to `agent_config`.
- Clicking a workflow card navigates to `/` (Home) and sets the prompt box text.
- Filters: "Output type" dropdown, "Practice area" dropdown, search bar.

**`src/components/NavigationSidebar.tsx`**: Add "Workflows" to `bottomNav` array with `Workflow` icon, path `/workflows`.

**`src/App.tsx`**: Add route for `/workflows`.

## 2. History / Activity Logs Page

**New file: `src/pages/History.tsx`**

A polished activity log showing all user actions:
- Conversations created/renamed/deleted
- Documents generated/edited
- Vault files uploaded/deleted
- Sheets created
- Workflows used

Data sourced from existing tables: `conversations` (created_at, updated_at), `files` (created_at), `messages` (created_at). Each log entry shows: icon, action description, timestamp (relative), and a link to the resource.

UI: Timeline-style list grouped by date ("Today", "Yesterday", "March 8"), with filter chips (All, Chats, Documents, Vault, Sheets).

## 3. Sheet Editor Improvements

**`src/components/editor/SheetEditor.tsx`**:

- **Column Builder**: Add "Fill mode" toggle — "AI fills" vs "Manual". When AI fills, send column metadata (name, description, type) to `llm-router` to populate values.
- **Remove datatype badge** from column headers. Show column details (name, type, description) on hover via a popover/tooltip.
- **Column click**: Opens a popover showing column details, "Edit description", "Regenerate with AI", "Fill manually", "Delete column" actions.
- **CSV Export**: Add "Export CSV" button in toolbar. Generates CSV from current sheet data and downloads.
- **AI updates create new version**: When AI modifies the sheet (e.g., "remove invoice date column"), it should update the existing sheet data as a new version rather than creating a new table. This requires the `llm-router` to detect an existing sheet in conversation context and output an updated sheet with the same structure.

## 4. Unified Versioning System (Docs + Sheets)

**`src/components/editor/DocumentEditor.tsx`** and **`src/components/editor/SheetEditor.tsx`**:

- **Version list**: Add a small version dropdown/list in the toolbar showing all saved versions (v1, v2, v3...). Clicking switches to that version's content (read-only view).
- **Show edits**: Compares current version with the immediately previous version. Red strikethrough for removed text/cells, green highlight for added text/cells. Already partially implemented in DocumentEditor — ensure it works with the version switching.
- **Save creates a version**: Manual save or AI update creates a new version. Current behavior already does this but versions aren't browsable — add the version switcher UI.

## 5. Fix Double Cursor (`||`) Issue

**`src/pages/Chat.tsx`** (lines 634-655) and **`src/components/chat/MessageBubble.tsx`** (lines 554-556):

The streaming cursor appears in TWO places simultaneously:
1. In `MessageBubble.tsx` line 554-556: renders a blinking bar when `isStreaming && !isUser`
2. In `Chat.tsx` line 635-655: renders a separate streaming indicator block after the last user message

When the assistant message starts arriving (content exists), both render. Fix: In the streaming indicator block in `Chat.tsx`, don't render the streaming indicator once the assistant message has started (the MessageBubble handles it). The `showStreamingIndicator` condition already checks `lastMsg?.role === "user"` — once the assistant message appears, `lastMsg` becomes assistant and the indicator hides. But there's a brief moment where both appear.

**Solution**: In `MessageBubble.tsx`, only show the blinking cursor when the message has actual content (not just empty string). This prevents the double cursor during the transition.

## 6. Workflow Click → Prompt Box (Already Done)

Already implemented in `Home.tsx` line 607: `onClick={() => setMessage(wf.description)}`. Workflows page will also navigate to Home and set the message.

---

## Files Modified

| File | Changes |
|------|---------|
| New `src/pages/Workflows.tsx` | Workflows grid, create workflow dialog, filters |
| New `src/pages/History.tsx` | Activity logs timeline with filters |
| `src/components/editor/SheetEditor.tsx` | Column popover, AI/manual fill, CSV export, hide type badges, version switcher |
| `src/components/editor/DocumentEditor.tsx` | Version switcher dropdown |
| `src/components/NavigationSidebar.tsx` | Add "Workflows" nav item |
| `src/App.tsx` | Add routes for `/workflows`, `/history` |
| `src/pages/Chat.tsx` | Fix double cursor |
| `src/components/chat/MessageBubble.tsx` | Only show cursor when content exists |
| `supabase/functions/llm-router/index.ts` | Workflow builder use case, sheet update logic |

