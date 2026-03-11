

# Plan: Fix Citations, Reply UX, References Display, Sidebar State, and Upload Loading

## Issues Identified

### 1. Unicode superscript citations not rendering as popovers
**Root cause found**: In `injectCitations()` (MessageBubble.tsx line 152), the bracket-stripping regex `/\[\]/g` matches the literal two-char string `[]`, not individual `[` and `]` characters. So `[¹⁴]` is never cleaned properly, `parseInt` returns `NaN`, and no popover renders. Fix: change to `/[\[\]]/g`.

Also line 150: `part.replace(/\[\],s/g, "")` should be `part.replace(/[\[\],\s]/g, "")`.

### 2. Reply button should add ChatGPT-style quoted context to prompt
Currently inserts markdown `> quote` which is ugly. Change to: prepend a truncated context badge above the textarea — show first ~80 chars with "..." and an X to remove. Store as separate `replyContext` state.

### 3. References block rendered as raw text in response
The `stripCitationsBlock` regex doesn't catch the verbose format `References: [¹] filename — Page N: "excerpt" [²]...`. Add a pattern to strip blocks starting with `References:` followed by multiple `[¹]`/`[*1]` entries.

### 4. Right sidebar persists when switching conversations
`loadConversation()` doesn't reset `editorDoc` or `sheetDoc`. Add clears at the top of `loadConversation`.

### 5. StepTracker reasoning re-opens when clicking files
The `useEffect` with auto-collapse timer re-fires on certain re-renders. Fix: track "has already collapsed" in a ref so once collapsed after streaming ends, it stays collapsed regardless of parent re-renders.

### 6. Upload loading text progression
Show rotating motivational/status messages during file processing: "Uploading files...", "Processing documents...", "Extracting text...", "Almost ready..." cycling every 2-3 seconds.

## File Changes

### `src/components/chat/MessageBubble.tsx`
- **Line 150**: Fix regex from `/\[\],s/g` to `/[\[\],\s]/g`
- **Line 152**: Fix regex from `/\[\]/g` to `/[\[\]]/g`
- **Lines 172-178**: Improve `stripCitationsBlock` to also strip verbose `References: [¹] filename — ...` blocks

### `src/pages/Chat.tsx`
- **`loadConversation`**: Add `setEditorDoc(null); setSheetDoc(null);` at top
- **Reply handler**: Replace `> quote` insertion with `replyContext` state (truncated preview badge above ChatInput)
- **Upload UX**: Add rotating status text state during file processing

### `src/components/chat/StepTracker.tsx`
- **useEffect (line 68-74)**: Use a `hasAutoCollapsed` ref. Once set to true after streaming ends, never re-trigger the collapse timer. Only reset when `isStreaming` becomes true (new stream).

### `src/components/chat/ChatInput.tsx`
- Add optional `replyContext` prop with `onRemoveReply` callback
- Render a small badge above the textarea showing truncated quoted text with dismiss button

