

# Plan: Mistral OCR, Text Selection Reply, and Streaming Fix

## Issues to Fix

1. **PDF text extraction is garbage** — The current "native PDF extraction" uses a naive regex (`/\(([^)]{2,})\)/g`) that pulls raw PDF binary content instead of actual text. Even for "native" PDFs, it extracts PDF object syntax, not readable text. Mistral OCR will fix this for all PDFs.

2. **Text selection → Reply to prompt box** — User wants to select text in a response, see a "Reply" tooltip, click it, and have the selected text quoted in the prompt input.

3. **Loading skeleton disappears then reappears** — The skeleton shows while `steps.length === 0`, but when steps arrive the skeleton hides before any assistant content appears. There's a gap where nothing shows.

4. **Admin panel: Replace AWS Textract OCR with Mistral OCR** — Replace the AWS OCR fields in AgentTab with a single Mistral API key field.

---

## File Changes

### 1. `supabase/functions/document-processor/index.ts`
**Replace AWS Textract with Mistral OCR in text extraction:**
- Remove the `callTextract` function entirely
- Add a `callMistralOCR(fileBytes, mimeType, apiKey)` function that:
  - Converts `Uint8Array` to base64 using `btoa`
  - Calls `https://api.mistral.ai/v1/ocr` with `model: "mistral-ocr-latest"`
  - Returns joined markdown from `data.pages[].markdown`
- **Fix the broken native PDF extraction**: The current regex `\(([^)]{2,})\)` extracts PDF object syntax, not text. Replace the naive extraction: always use Mistral OCR for PDFs (it handles both native and scanned). For text/plain and markdown, keep the decoder. For DOCX, keep the XML parser.
- Read `mistral_api_key` from `ocrConf.mistral_api_key` instead of AWS keys
- For images: use Mistral OCR instead of Textract
- Remove all AWS SigV4 signing helpers (`sha256Hex`, `hmacSha256`, `getSignatureKey`, etc.) — they're only used by Textract and R2. **Wait**: R2 signing still uses them. Keep the R2/SigV4 helpers, only remove `callTextract`.

### 2. `src/components/admin/AgentTab.tsx`
- Replace `awsAccessKey`, `awsSecretKey`, `awsRegion` state variables with `mistralApiKey`
- Update the OCR config section UI: single "Mistral API Key" input field instead of 3 AWS fields
- Update `handleSave` to save `ocr: { mistral_api_key: mistralApiKey }` instead of AWS fields
- Update load logic to read `c.ocr?.mistral_api_key`

### 3. `src/pages/Chat.tsx` — Text selection "Reply" feature
- Add a `useEffect` that listens for `mouseup` / `selectionchange` events on the messages container
- When text is selected within an assistant message, show a floating "Reply" button near the selection
- On click, prepend the selected text as a quote (`> selected text\n\n`) to the input field
- Use a portal or absolute-positioned div for the tooltip

### 4. `src/pages/Chat.tsx` — Fix skeleton gap
- Change `showSkeleton` logic: show skeleton when `isStreaming && lastMsg?.role === "user"` (remove the `steps.length === 0` condition). The skeleton should show until the assistant message appears in the messages array, regardless of steps.
- Actually, better: show skeleton when streaming AND no assistant message has been added yet (last message is still user). Steps appearing should not hide the skeleton — the `StepTracker` renders inside the `MessageBubble` which only appears when the assistant message exists.

Current logic: `const showSkeleton = isStreaming && lastMsg?.role === "user" && steps.length === 0;`
Fix: `const showSkeleton = isStreaming && lastMsg?.role === "user";`

But this means the skeleton shows even when steps are visible. The issue is that steps arrive (via SSE) before the assistant message is created. Steps are shown via `showSteps` on the last user message. So when steps arrive, they render on the user message's `MessageBubble` — but the skeleton also shows below it. We need: skeleton only when no steps AND no assistant content yet.

Actually looking more carefully: steps ARE passed to the last user message via `showSteps`. So the `StepTracker` renders inside the user's `MessageBubble`. But the skeleton renders AFTER the user message bubble. So the user sees: their message with steps inside it, AND a skeleton below. When the assistant message arrives, the skeleton disappears and the assistant bubble appears — but there might be a flicker.

The real fix: Don't show skeleton when steps have arrived. The current logic `steps.length === 0` is correct for that. The "disappears then reappears" issue is likely because the assistant message gets created (skeleton hides), then the message state updates cause a brief flicker. Let me look at the streaming logic...

In `useStreamChat.ts`, when a `reasoning` or `token` event arrives, it creates the assistant message. But before that, only `steps` events arrive. So the flow is:
1. User sends → skeleton shows (steps empty, last msg is user)
2. Steps SSE arrives → skeleton hides (steps not empty), but steps render on user message
3. Token/reasoning arrives → assistant message created, steps now render on assistant message

The "gets removed and gets back" is the transition between step 2 and 3. In step 2, the steps show on the user message bubble. In step 3, the assistant message appears with steps. There's no skeleton in between, but the steps might briefly disappear during re-render.

Actually the issue is: in step 2, steps render on the user message. In step 3, a new assistant message appears — but `showSteps` for the user message becomes false (because there IS an assistant message after it now), and the steps move to the assistant message. This transition should be seamless.

The "loading lawkit ai agent gets removed" likely refers to the steps tracker disappearing briefly. Let me check: when the assistant message first appears with empty content, does the `StepTracker` show? Yes, because `steps?.length` is truthy. So it should be fine.

The real issue might be simpler: the skeleton shows the "LawKit AI" avatar + loading bars. When steps arrive, skeleton hides but steps are on the USER message (not showing a new LawKit AI header). Then when assistant arrives, LawKit AI header + steps appear. The user sees: LawKit AI skeleton → disappears → steps on their own message (no LawKit AI label) → LawKit AI appears with answer.

**Fix**: Show the skeleton (LawKit AI avatar + loading) whenever streaming AND the last message is user, but replace skeleton bars with the StepTracker when steps exist. This means the skeleton area always shows the LawKit AI branding during streaming.

Better approach: Move the "waiting for response" UI out of the message list. Instead, always show a dedicated streaming indicator after the last user message that includes the LawKit AI avatar + either skeleton bars (no steps yet) or StepTracker (steps arrived). This stays visible until the assistant message appears.

Simplest fix: Change the skeleton section to also render steps if available:

```tsx
{isLastUser && isStreaming && i === messages.length - 1 && (
  <div className="mt-4">
    <div className="flex items-center gap-2 mb-2">
      <Bot avatar />
      <span>LawKit AI</span>
    </div>
    <div className="pl-8">
      {steps.length > 0 ? (
        <StepTracker steps={steps} isStreaming={true} />
      ) : (
        <Skeleton lines />
      )}
    </div>
  </div>
)}
```

And remove `steps` from being passed to user messages. Only pass steps to assistant messages.

### 5. `src/components/chat/ChatInput.tsx`
- Add a `quotedText` prop that, when set, shows the quoted text above the input with an X to dismiss
- Or simpler: just prepend to the input value from Chat.tsx

---

## Summary

| File | Change |
|------|--------|
| `document-processor/index.ts` | Replace Textract with Mistral OCR; remove broken native PDF regex; always OCR PDFs |
| `AgentTab.tsx` | Replace AWS OCR fields with single Mistral API key field |
| `Chat.tsx` | Add text selection → Reply feature; fix streaming skeleton/steps gap |
| `ChatInput.tsx` | Minor: accept quoted text display (optional) |

