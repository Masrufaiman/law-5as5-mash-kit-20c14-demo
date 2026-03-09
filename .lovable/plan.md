

# Fix: Null Character Sanitization, Collapsible Sidebar, Reasoning/Thinking in Steps

## 3 Issues

### 1. Document Processor `\u0000` Error
**Root cause**: PDF text extraction picks up null bytes (`\u0000`) from binary PDF content. PostgreSQL rejects null bytes in text columns. The fix is simple: sanitize extracted text before chunking/inserting.

**Fix in `document-processor/index.ts`**: After text extraction (around line 176), add:
```typescript
extractedText = extractedText.replace(/\u0000/g, '');
```
This strips all null characters before chunking, embedding, and DB insert.

### 2. Collapsible Left Sidebar
**Current**: Fixed 224px sidebar with no collapse option.

**Fix**:
- Add a `collapsed` state to `NavigationSidebar.tsx`
- Add a collapse toggle button (e.g., `PanelLeftClose`/`PanelLeftOpen`) next to the Search icon in the header
- When collapsed: sidebar shrinks to ~48px, showing only icons (no labels, no vault/chat lists)
- Icons for: Assistant, Vault, Review, Documents, etc. remain visible as icon-only buttons
- The org header collapses to just the "LK" logo
- Bottom settings icons remain as icon-only
- Update `AppLayout.tsx` to accommodate dynamic sidebar width (or let the sidebar manage its own width)

### 3. Reasoning/Thinking Text in Collapsible Block
**Current**: Steps show as short labels ("Searching web...", "Generating response"). The user wants the AI's reasoning/thinking text to appear in the collapsible step tracker at the top of each response — like Perplexity's "thinking" block.

**Fix**:
- **`llm-router`**: Gemini 2.5 Flash returns `<think>` blocks or reasoning content. Parse the streamed response for `<think>...</think>` tags. Send reasoning tokens as a new SSE event type `reasoning` instead of `token`.
- **`useStreamChat.ts`**: Add `reasoning?: string` field to `ChatMessage`. When `type === "reasoning"` events arrive, accumulate into `reasoning` field.
- **`MessageBubble.tsx`**: When `message.reasoning` exists, render it inside the `StepTracker`-like collapsible block at the top of the assistant response. Show as a collapsible "Thinking" section with the reasoning text in muted/smaller font.
- **`StepTracker.tsx`**: Add optional `reasoning?: string` prop. When present, show reasoning text inside the collapsible area below the steps.

---

## File Changes

| File | Change |
|------|--------|
| `document-processor/index.ts` | Add `extractedText = extractedText.replace(/\u0000/g, '')` after text extraction |
| `NavigationSidebar.tsx` | Add `collapsed` state, toggle button, conditional icon-only rendering |
| `AppLayout.tsx` | Pass through / accommodate collapsed sidebar width |
| `llm-router/index.ts` | Parse `<think>` blocks from Gemini stream, send as `reasoning` SSE events |
| `useStreamChat.ts` | Add `reasoning` to `ChatMessage`, handle `reasoning` SSE event type |
| `MessageBubble.tsx` | Render reasoning in collapsible block above response content |
| `StepTracker.tsx` | Add reasoning text display below steps |

