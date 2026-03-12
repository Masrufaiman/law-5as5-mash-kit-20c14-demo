

# Plan: 6 Fixes — File Switching, Scroll Preservation, JSON Error, Document Routing, Red Flags Mode, Agent Routing Logic

## 1. Fix file switching in right panel (closes instead of replacing)

**Root cause:** `handleDocumentOpen` (line 563) toggles off when same title is clicked. But even for different files, the `editorDoc` state change causes a re-render that can lose context.

The actual issue: clicking a new file works fine for different names. The real problem is the toggle logic — clicking the same file name closes it. For different files, it should just replace. This already works at line 566 (`setEditorDoc({ title, content })`).

**Wait** — re-reading: "click on another one file then previous file is getting closed. rather i need to just open that new file instead." This suggests the panel closes briefly and reopens, or the `handleDocumentOpen` toggle logic fires incorrectly due to stale `editorDoc` closure reference.

**Fix in `Chat.tsx` line 555-572:** The `useCallback` depends on `[editorDoc]` which creates a new closure every time editorDoc changes. When clicking a new file, the `editorDoc?.title === title` check may fire on stale state. Change the toggle-off logic: only toggle off on explicit close button, never on `handleDocumentOpen`. Always replace.

```typescript
const handleDocumentOpen = useCallback((title: string, content: string, excerpt?: string) => {
  const container = scrollContainerRef.current;
  const viewport = container?.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
  const scrollTop = viewport?.scrollTop || 0;
  setHighlightExcerpt(excerpt);
  setEditorDoc({ title, content }); // Always open, never toggle
  requestAnimationFrame(() => {
    if (viewport) viewport.scrollTop = scrollTop;
  });
}, []);
```

## 2. Fix scroll jumping to top when closing right panel

**Root cause:** The `onClose` handlers (lines 870-879) save/restore scroll position, but the `requestAnimationFrame` restore happens after React re-renders the layout (the right panel disappearing changes the chat area width, triggering reflow). The viewport reference may become stale.

**Fix:** Use a more robust approach — save scrollTop before state change, then restore after a double `requestAnimationFrame` or `setTimeout(0)` to ensure layout has settled.

In all `onClose` handlers and in `handleDocumentOpen`, change:
```typescript
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    if (viewport) viewport.scrollTop = scrollTop;
  });
});
```

## 3. Fix raw JSON in chat response (image analysis)

**Root cause:** The screenshot shows the LLM returned a raw JSON object with `file_path` and `operations` (replace operation) instead of a natural language response. This happens when `currentDocumentContent` is set (line 1200-1202) — the system prompt says "VERSION UPDATE MODE" and the LLM sometimes outputs JSON edit instructions instead of prose.

**Fix in `llm-router/index.ts` line 1200-1202:** Strengthen the document editing context to explicitly prohibit JSON output:
```
## Currently Open Document (VERSION UPDATE MODE)
When the user asks to modify a document, output the COMPLETE updated document as markdown starting with "# [Same Title]".
NEVER output JSON operations, file_path objects, or structured edit instructions. Always output the full updated document text.
```

## 4. Fix wrong document analyzed (vault searching irrelevant files)

**Root cause:** The user uploaded `LP5_SideLetter_MeridianCapital.docx` and attached `Prompt Uploads` vault. The question was about Meridian Capital, but the agent searched the vault and found `b98af802...pdf` (a Cloudflare invoice) instead. The `toolVaultSearch` does vector similarity which returned the wrong file. The attached file IDs weren't properly scoped.

The core issue: when user says "use mashraf aiman" with `Prompt Uploads` vault selected, the vault search returns irrelevant files. The `attachedFileIds` aren't being sent because the vault is "Prompt Uploads" not "Uploads" (line 542 only checks `vaultName === "Uploads"`).

**Fix in `Chat.tsx` line 542:** Change the condition to also match "Prompt Uploads":
```typescript
if ((vaultName === "Uploads" || vaultName === "Prompt Uploads") && conversationAttachedFileIds.length > 0) {
```

## 5. Fix red flags refusing to analyze ("does not contain red lines")

**Root cause:** The user sent "analyze red lines" in `review` mode with a file attached. The mode is `review` not `red_flags`, so the red flag prompt doesn't activate. The LLM interprets "red lines" literally as tracked changes.

**Fix in `llm-router/index.ts`:** In the intent analysis or mode detection, detect "red line" / "red flag" keywords and override `effectiveMode` to `red_flags` regardless of the user's selected mode. Add after line 713:

```typescript
// Auto-detect red flag intent from message keywords regardless of mode
const isRedFlagIntent = /red\s*flag|red\s*line|flag.*clause|risky.*clause|analyze.*risk/i.test(message);
if (isRedFlagIntent && effectiveMode !== "red_flags") {
  effectiveMode = "red_flags";
}
```

Wait — `effectiveMode` is `const`. Need to make it `let`.

## 6. Rewrite Agent Routing Logic

**Replace the current intent analysis + tool selection with a hard-coded classification layer.** This is the biggest change.

**In `llm-router/index.ts`:** Add a `classifyRequestType` function before the intent analysis that returns TYPE 1-4. Then use it to override the tool selection logic.

```typescript
function classifyRequestType(message: string, hasAttachedFiles: boolean, hasVault: boolean, conversationHistory: any[]): 1 | 2 | 3 | 4 {
  // TYPE 3 — Document task (file attached or explicit doc reference)
  if (hasAttachedFiles) return 3;
  if (/this document|the uploaded|these contracts|attached file|this NDA|this contract/i.test(message)) return 3;
  
  // TYPE 2 — Case/research lookup
  if (/v\.\s|vs?\.\s|court|appeal|ruling|judgment|citation|\d+\s+(So|F|U\.S|S\.Ct)|case\s+(no|number|#)/i.test(message)) return 2;
  
  // TYPE 4 — Vault task
  if (/\b(our|my vault|saved|previous|from\s+(?:the\s+)?vault)\b/i.test(message)) return 4;
  
  // TYPE 1 — Factual/legal question (default)
  return 1;
}
```

Then at line 850-872, replace the tool selection with:

```typescript
const requestType = classifyRequestType(message, !!attachedFileIds?.length, hasVault, conversationHistory);

let nextTool: string;
switch (requestType) {
  case 1: // Factual — no vault, maybe web if complex
    nextTool = (complexity >= 4 && perplexityKey) ? "web_search" : "";
    break;
  case 2: // Case lookup — web search, skip vault
    nextTool = perplexityKey ? "web_search" : "";
    break;
  case 3: // Document task — read files
    nextTool = "read_files";
    break;
  case 4: // Vault task
    nextTool = "vault_search";
    break;
}
```

Also add **short message context resolution** (line ~817): if message has fewer than 6 words and conversation history exists, prepend the last assistant topic:

```typescript
let resolvedMessage = message;
if (message.split(/\s+/).length < 6 && conversationHistory.length > 0) {
  const lastAssistant = [...conversationHistory].reverse().find(m => m.role === "assistant");
  if (lastAssistant) {
    const topicSummary = lastAssistant.content.substring(0, 200);
    resolvedMessage = `Context: "${topicSummary}"\n\nUser follow-up: ${message}`;
  }
}
```

Use `resolvedMessage` in intent analysis and tool queries.

Also update the intent analysis prompt to include the hard rules about never searching vault for TYPE 1/2, and cap TYPE 1 to max 2 steps.

## File Changes Summary

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Fix file switching (always replace, never toggle); fix scroll preservation (double rAF); fix Prompt Uploads vault scoping |
| `supabase/functions/llm-router/index.ts` | Fix document editing JSON output; add request type classifier; rewrite tool selection; add red flag intent detection; add short message context resolution; strengthen routing rules |

