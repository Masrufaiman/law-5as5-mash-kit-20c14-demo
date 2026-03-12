

# Plan: 6 Improvements — Memory Upgrade, Search Tabs, File Viewer, Selection-Reply, NDA Quality, Multi-Doc Drafting

## 1. Upgrade Agent Memory from Prose to Structured Facts

**Current:** Phase 7 in `llm-router` generates a 2-sentence prose summary. Lossy for legal specifics.

**Changes in `supabase/functions/llm-router/index.ts`:**
- Change the memory generation prompt (Phase 7, lines 1329-1360) from "2 concise sentences" to structured fact extraction:
  ```
  "Extract key legal facts from this exchange as a JSON array. Each fact: {type, field, value, source_doc?}. 
  Types: user_standard, document_reviewed, decision_made, preference.
  Only extract concrete facts (durations, jurisdictions, names, rates). Skip generic observations.
  Output ONLY the JSON array."
  ```
- Parse the JSON array, insert each fact as a separate `agent_memory` row with `category` set to the fact `type`
- Add supersession logic: before inserting, check if an existing entry with the same `field` exists for this user — if so, delete the old one (handles corrections like "actually 6 months not 12")
- Keep the 50-entry rolling prune
- When loading memory (Phase 1, line 770), filter by relevance: for `red_flags`/`review` modes, prioritize `document_reviewed` entries; for `drafting`, prioritize `user_standard` entries. Still load last 10 overall but weight mode-relevant ones.

**No migration needed** — existing `agent_memory` table schema works (content stores the fact value, category stores the type).

## 2. Fix Search Dialog — Deduplicate Hover + Add Tabs

**Problem:** CommandItem uses `value` prop derived from title text. Two conversations with the same title get the same computed value, causing both to highlight on hover.

**Changes in `src/components/NavigationSidebar.tsx` (lines 458-498):**
- Add unique `value` prop to each `CommandItem`: `value={r.id}` — this ensures cmdk treats them as distinct items
- Add tabs inside the CommandDialog: Chats, Vaults, Files, Workflows
- Use a local tab state; default to "Chats"
- For Vaults tab: query `vaults` table on search
- For Files tab: query `files` table on search  
- For Workflows tab: load from `api_integrations` agent_config
- Each tab renders its own `CommandGroup` with appropriate icons and navigation targets

## 3. Open Files in Right Sidebar

**Current:** `handleFileClick` in `Chat.tsx` already fetches file content and calls `handleDocumentOpen` which sets `editorDoc`. This works for file refs in chat. 

**Extend:** Make uploaded file chips, vault file links, and source file references all trigger `handleFileClick`. The `onFileClick` prop is already wired through `StepTracker` → `MessageBubble`. Need to:
- In `MessageBubble.tsx`: pass `onFileClick` to attachment badges (the file names shown in user messages) so clicking them opens the file in the sidebar
- In `ChatInput.tsx`: when showing attached file pills, add an onClick that calls a new `onAttachedFileOpen` prop
- Ensure `handleFileClick` handles the case where the file is still processing (show a toast "File still processing")

**Files:** `src/components/chat/MessageBubble.tsx`, `src/pages/Chat.tsx`

## 4. Selection-to-Reply Enhancement

**Current:** Selection-to-reply exists in Chat.tsx (lines 353-417) but only works on the chat message area. Need to extend to:
- Document editor content (right sidebar)
- Sheet editor content
- Uploaded file viewer content

**Changes:**
- In `Chat.tsx`: extend the `mouseup` listener scope to include the editor panel (or add a callback prop to `DocumentEditor` and `SheetEditor`)
- Add `onSelectionReply` prop to `DocumentEditor` and `SheetEditor` that passes selected text back to Chat
- In `DocumentEditor.tsx`: add a mouseup handler on the Quill container that checks for selection and shows a floating "Reply" button, calling `onSelectionReply`
- In `SheetEditor.tsx`: same pattern for cell content selection

**Files:** `src/pages/Chat.tsx`, `src/components/editor/DocumentEditor.tsx`, `src/components/editor/SheetEditor.tsx`

## 5. Fix NDA Drafting Quality — Default Jurisdiction + Strip Preamble

**Changes in `supabase/functions/llm-router/index.ts`:**

**Fix A — Default jurisdiction (drafting prompt, line 1092-1104):**
Add to `draftingModePrompt`:
```
- Unless the user specifies a jurisdiction, always draft under the laws of England and Wales with exclusive jurisdiction of the courts of England and Wales. Never default to US law.
```

**Fix B — Strip AI preamble from exported documents:**
Add to `draftingModePrompt`:
```
- Start your response with the document title as "# [Title]". Do NOT include any conversational preamble, explanations, caveats, or "as an AI..." text before the document. The first line of your output must be the document heading.
```

**Fix C — In `DocumentEditor.tsx` export functions:** Add a sanitizer that strips any content before the first `# ` heading when exporting .doc or .txt.

**Files:** `supabase/functions/llm-router/index.ts`, `src/components/editor/DocumentEditor.tsx`

## 6. Multi-Document Drafting + Clarification Threshold

**Changes in `supabase/functions/llm-router/index.ts`:**

Add to `draftingModePrompt` (line 1092):
```
- When the user requests multiple documents (e.g., "write 5 NDAs"), draft ALL of them in sequence. Use placeholder party names (Party A / Vendor 1, Vendor 2, etc.), England and Wales as default governing law, and 2-year confidentiality period as default unless specified. List all assumptions in Drafting Notes at the end.
- NEVER say "I can only generate one document at a time". Generate as many as requested.
- Only ask for clarification if ZERO information was provided about the document type or purpose. If the user has specified a purpose, document type, or said details should be random/varied, proceed immediately with reasonable defaults and placeholders.
```

Also increase `max_tokens` for drafting mode (line 1189): when `effectiveMode === "drafting"`, set `max_tokens: 16384` to accommodate multiple documents.

**File:** `supabase/functions/llm-router/index.ts`

## Implementation Order

1. Agent memory upgrade (structured facts)
2. Search dialog tabs + hover fix
3. File viewer in sidebar
4. Selection-to-reply extension
5. NDA quality fixes (jurisdiction + preamble + multi-doc)

## File Changes Summary

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Structured memory extraction, fact supersession, mode-filtered loading; drafting prompt: default jurisdiction, no preamble, multi-doc, clarification threshold, higher max_tokens |
| `src/components/NavigationSidebar.tsx` | Unique CommandItem values, tabbed search (Chats/Vaults/Files/Workflows) |
| `src/components/chat/MessageBubble.tsx` | File attachment chips clickable to open in sidebar |
| `src/pages/Chat.tsx` | Extend selection-reply scope to editor panels |
| `src/components/editor/DocumentEditor.tsx` | Strip preamble on export; onSelectionReply prop |
| `src/components/editor/SheetEditor.tsx` | onSelectionReply prop |

