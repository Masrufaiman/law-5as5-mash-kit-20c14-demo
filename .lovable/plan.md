

# Plan: Unified Prompt Box, File Click → Sidebar, Doc Streaming to Sidebar, Perplexity Clarification

## 5 Issues to Address

### 1. Small changes = new version, not new doc
When `handleDocumentOpen` is called and a document with the same title already exists in the editor, it should add the new content as a version rather than replacing the entire editor. The `DocumentEditor` already has versioning (`versions` state). Fix: pass a callback or detect same-title opens and append as a new version.

### 2. Streaming doc/sheet → right sidebar, not chat bubble
During streaming, when `detectDocument()` or `detectSheet()` would trigger, content should stream into the sidebar editor instead of the chat. Currently this only happens post-stream. Fix: during streaming, when content exceeds 500 chars and has headings, auto-open the sidebar editor and pipe tokens there. Show only a compact card in chat.

### 3. Perplexity clarification
Already configured via admin panel — that stores an encrypted API key in `api_integrations`. The Lovable connector would add `PERPLEXITY_API_KEY` as an env var directly in the edge function. The admin panel approach requires decryption at runtime. Both work. No code changes needed — just clarification.

### 4. Chat page prompt box must clone Home page prompt box
The Home page Sources dropdown includes: **Upload files** button, **Vaults**, **Knowledge Base** entries, **Jurisdictions**. The Chat page's `ChatInput` is missing: Upload files inside Sources, Knowledge Base entries, file attachment chips display above textarea. Also the Chat page shows a separate `Paperclip` Attach button that Home doesn't have.

**Changes to `ChatInput`:**
- Add `onFileSelect` (upload files) option inside the Sources dropdown (like Home)
- Add `kbSources` prop for knowledge base entries in Sources dropdown
- Add `attachedFiles` prop + `onRemoveFile` for showing file chips above textarea (like Home's chip area)
- Remove the separate `Paperclip` Attach button (Home doesn't have it)
- Ensure chip area shows: workflow tag, selected vault, deep research, active sources, attached files, prompt mode — exactly like Home

**Changes to `Chat.tsx`:**
- Pass `kbSources` (fetch from knowledge_entries)
- Pass `attachedFiles` and handlers
- Show chips above textarea matching Home's pattern

### 5. Click file/source → open in right sidebar with scroll to excerpt
When a user clicks a file name in `CollapsibleReferences` or in `StepTracker` file chips:
- Fetch the file's `extracted_text` from the `files` table
- Open it in the `DocumentEditor` sidebar
- Search for the citation excerpt in the text and scroll to it
- Highlight the matching excerpt

**Changes:**
- `handleFileClick` in `Chat.tsx`: accept optional `excerpt` param, pass it to `DocumentEditor`
- `DocumentEditor`: accept optional `highlightExcerpt` prop, on mount search for it in content and scroll to it + highlight
- `CollapsibleReferences`: pass excerpt when calling `onFileClick`
- `MessageBubble`: update `onFileClick` signature to include excerpt

## File Changes

| File | Changes |
|------|---------|
| `src/components/chat/ChatInput.tsx` | Add Upload files inside Sources dropdown; add kbSources prop; add attachedFiles/onRemoveFile chips; remove separate Attach button; match Home's chip area exactly |
| `src/pages/Chat.tsx` | Fetch kbSources; manage attachedFiles state with chips; pass new props to ChatInput; update handleFileClick to accept excerpt; pass highlightExcerpt to DocumentEditor |
| `src/components/editor/DocumentEditor.tsx` | Add highlightExcerpt prop; on mount, search and scroll to excerpt; add version-append logic for same-title opens |
| `src/components/chat/MessageBubble.tsx` | Update onFileClick to pass excerpt; update CollapsibleReferences; detect doc during streaming → emit to sidebar via callback instead of rendering in chat |

