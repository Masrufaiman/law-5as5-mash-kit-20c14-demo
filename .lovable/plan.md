

# Fix: Generative UI, First-Message Bug, Document Panel

## Three Issues

### 1. First message from Home page doesn't show response
**Root cause**: In `Chat.tsx` line 107-118, the `useEffect` that handles `location.state.initialMessage` has a dependency on `profile?.organization_id`. When navigating from Home, the effect fires but `profile` may not be ready yet, or it fires once and then `navigate("/chat", { replace: true, state: {} })` clears the state before `createConversationAndSend` completes. The real bug: `sendMessage` in `useStreamChat` uses a stale `messages` closure (line 70: `const history = messages.map(...)`) because `messages` is captured at the time of the `useCallback` creation, not at call time. The `sendMessage` depends on `[messages]` which means it recreates on every message change, but on first call `messages` is `[]` — this is fine. The actual issue is likely a race condition: `createConversationAndSend` is `async` and calls `sendMessage` inside, but the effect might re-run due to `location.state` changing when we call `navigate`. 

**Fix**: Add a ref guard `initialMessageSentRef` to prevent double-firing. Also ensure we don't clear state before the send completes.

### 2. Generative UI for multiple-choice responses
When the AI responds with numbered options (like "1. Draft another NDA... 2. Revise..."), render them as clickable cards instead of plain text. Detect the pattern in `MessageBubble` and render an interactive `ChoiceCards` component. When user clicks a choice, it sends that option as the next message.

### 3. Document content in right panel, only title on left
Currently the full document renders in the left chat area with a small "Open in editor" link. Instead: when an assistant message contains a document/draft (detected by heading + length > 500 chars), show ONLY a file card/title in the left chat, and auto-open the full content in the right-side editor panel.

---

## File Changes

### `src/components/chat/ChoiceCards.tsx` (NEW)
- Detect numbered choice patterns: `1. **Option title**...` or `1. Option text`
- Render as clickable cards with option number badges
- Include a text input at bottom for "Other" / custom response
- `onSelect(text: string)` callback sends choice as next message

### `src/components/chat/MessageBubble.tsx`
- Add choice detection: if message content matches a multiple-choice pattern (numbered list where each item is a distinct option/question), render `ChoiceCards` instead of markdown for that section
- Add `onChoiceSelect` prop to bubble, passed through from Chat.tsx

### `src/pages/Chat.tsx`
- **First message fix**: Add `initialMessageSentRef = useRef(false)` guard. Set it to `true` before calling `createConversationAndSend`. Reset on `handleNewThread`.
- **Document detection**: When an assistant message has a document pattern (heading + >500 chars), auto-set `editorDoc` and show only a compact file card in the left panel instead of the full content
- **Choice handling**: Pass `onChoiceSelect` to `MessageBubble` — when clicked, send that text as next message

### `src/hooks/useStreamChat.ts`
- Add `documentContent` field to `ChatMessage` interface — when the backend streams a document type response, store it separately
- No other changes needed

### `supabase/functions/llm-router/index.ts`
- Add instruction in system prompt: "When you need user clarification between multiple options, format as a numbered list with **bold option titles**. When drafting documents, start with a clear `# Document Title`."

---

## Summary

| File | Change |
|------|--------|
| `Chat.tsx` | Fix first-message race with ref guard; auto-open docs in right panel; pass choice handler |
| `MessageBubble.tsx` | Detect choice patterns → render `ChoiceCards`; detect doc patterns → render compact card |
| `ChoiceCards.tsx` | New component: clickable option cards + "Other" input |
| `llm-router/index.ts` | Add formatting instructions to system prompt |

