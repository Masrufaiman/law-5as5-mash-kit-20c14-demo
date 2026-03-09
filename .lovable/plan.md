

# Fix: Editor, Scroll, Colors, Rename, Share, Export, Search, Duplicate MCQ

## Issues from screenshots and description

1. **Right panel too narrow by default** — increase from 30% to 45%, min from 20% to 25%
2. **Toggling right panel scrolls chat to top** — the `ScrollArea` re-renders when `rightPanel` toggles. Need to preserve scroll position using a ref and restore after toggle.
3. **"Generating response" shows on previous message** — the `StepTracker` with `steps` is passed to both the last user message AND the last assistant message. When steps exist but the assistant hasn't responded yet, it shows on the previous assistant message too. Fix: only pass `steps` to the skeleton/loading area after the last user message, not to any historical assistant messages.
4. **`**bold**` not rendering** — the preamble in `ChoiceCards` uses `ReactMarkdown` but the `MultiStepQuestionnaire` preamble uses a plain `<p>` tag. Fix: use `ReactMarkdown` there too.
5. **`---` and References in document** — the `stripCitationsBlock` regex doesn't catch `---\n\nReferences:` blocks. Also the `---` HR separators should be stripped from docs before opening in editor. Broaden the strip regex.
6. **Same MCQ shown twice** — when AI responds with both a "need more info" pattern AND numbered choices, `parseChoices` calls `parseNeedMoreInfo` first which returns default choices, then the AI text itself also has choices. The user message after selection triggers a new AI response that also has choices. The duplicate is the second AI response re-asking. This is an LLM behavior issue, but we can also ensure `ChoiceCards` doesn't show if the previous assistant message already had identical choices.
7. **Nothing should be black** — the progress bar and user "U" avatar use black/primary. The `Progress` indicator bar and user avatar background should use `primary` (dark teal #0e2526) which is already set. The issue is the progress bar indicator might be black. Check Progress component.
8. **Rename conversation** — clicking on the title in the header should make it editable (inline input), save to supabase on blur/enter.
9. **Export working** — Export button should download the full conversation as markdown.
10. **Share working** — Share creates a `share_token` on the conversation, generates a public URL. Need a DB migration to add `share_token` and `is_public` to conversations, plus a public route to view shared conversations.
11. **Search previous chats** — the command palette should search conversation titles dynamically as user types, not just show the pre-loaded 10 recent chats.
12. **More Quill editor features** — add more toolbar items: alignment, indent, image, font size, undo/redo, find/replace.
13. **Contact placeholders → personalized data** — this is an LLM prompt issue; update system prompt to use user's organization data instead of placeholders.

---

## File Changes

### DB Migration
- Add `share_token text unique`, `is_public boolean default false` to `conversations`

### `src/components/AppLayout.tsx`
- Increase right panel `defaultSize` to 45%, `minSize` to 25%

### `src/pages/Chat.tsx`
- **Scroll preservation**: save scroll position before toggling `editorDoc`, restore after
- **Rename**: make header title editable on click → inline input, save to supabase on blur/enter, update `conversationTitle` state
- **Export**: implement `handleExport` that builds markdown from all messages and downloads as `.md`
- **Share**: implement `handleShare` that generates a `share_token` (uuid), updates conversation in DB, copies public URL to clipboard
- **Fix steps placement**: only pass `steps` to the skeleton loading area (after last user msg), NOT to previous assistant messages. Remove `steps` from `MessageBubble` props for historical assistants.

### `src/pages/SharedChat.tsx` (NEW)
- Public page that loads a conversation by `share_token` (no auth required)
- Read-only view of messages using `MessageBubble`
- Route: `/shared/:token`

### `src/App.tsx`
- Add `/shared/:token` route (no `ProtectedRoute`)

### `src/components/chat/MessageBubble.tsx`
- Fix: remove `StepTracker` from the component entirely. Steps are now only shown in `Chat.tsx` skeleton area.
- Actually no — keep StepTracker but only render when `steps` prop is passed. The fix is in `Chat.tsx` to not pass `steps` to old assistant messages.

### `src/components/chat/MultiStepQuestionnaire.tsx`
- Change preamble from `<p>` to `<ReactMarkdown>` for proper bold rendering

### `src/components/chat/ChoiceCards.tsx`
- Already uses `ReactMarkdown` for preamble — good

### `src/components/editor/DocumentEditor.tsx`
- Add more toolbar items: alignment, indent/outdent, font size, image, undo, redo, subscript, superscript, clean
- Strip `---` and `References:` blocks from content before converting to HTML

### `src/components/NavigationSidebar.tsx`
- **Search**: add a `searchQuery` state. When user types in CommandInput, do a live supabase query to search conversations by title (ilike). Show results in search results group.

### `src/components/chat/StepTracker.tsx`
- No changes needed

### `src/components/ui/progress.tsx`
- Ensure the indicator uses `bg-primary` not black

### `supabase/functions/llm-router/index.ts`
- Update system prompt: "Never use placeholder text like [Firm Name], [Email Address]. Use the organization's actual data when available."

---

## Summary

| File | Change |
|------|--------|
| DB migration | Add `share_token`, `is_public` to conversations |
| `AppLayout.tsx` | Wider right panel default |
| `Chat.tsx` | Scroll preservation, rename header, export MD, share URL, fix steps placement |
| `SharedChat.tsx` | New public shared chat viewer |
| `App.tsx` | Add shared route |
| `MultiStepQuestionnaire.tsx` | ReactMarkdown for preamble |
| `DocumentEditor.tsx` | More toolbar items, strip separators/references |
| `NavigationSidebar.tsx` | Live search conversations |
| `progress.tsx` | Ensure primary color |
| `llm-router` | No placeholder text in prompts |

