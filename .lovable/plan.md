

# Plan: Fix Red Flag Analysis Auto-Opening Redline View

## Status of Requested Items

| Request | Status |
|---------|--------|
| 1. Deep research trigger refinement | Already handled by routing logic |
| 2. CourtListener, EDGAR, EUR-Lex in admin | Already implemented (`LegalApisTab.tsx`) |
| 3. Google Auth + Drive | Google Auth already implemented. Drive requires Google API credentials as Supabase secrets — ready to build once you provide them |
| 4. Perplexity = search, LLM = chat completion | Already correct in architecture |
| **5. Red flag redline view not auto-opening** | **Needs fix — detailed below** |

## The Red Flag Problem (from the screenshot)

The screenshot shows red flag analysis completed with flags visible in chat, but the document is NOT opened in the right-side redline view. Two bugs cause this:

### Bug A: Auto-open only triggers when `promptMode === "red_flags"`

Line 435 in `Chat.tsx`:
```typescript
if (prevStreamingRef.current && !isStreaming && promptMode === "red_flags") {
```

If the user types "review red line analysis" while in `review` mode, the router's `isRedFlagIntent` regex overrides `effectiveMode` on the backend, but the frontend `promptMode` state is still `"review"`. The auto-open effect never fires.

**Fix:** Remove the `promptMode === "red_flags"` condition. Instead, always check the last assistant message for red flag data when streaming finishes, regardless of mode.

### Bug B: "Open in Editor" button doesn't set `redFlagData` on Chat.tsx

When the user clicks "Open in Editor" on the RedFlagCard, `MessageBubble` calls `onFileClick(docName, docId)` which opens the file in `DocumentEditor` — but `redFlagData` state at Chat.tsx level is never set. So the right panel shows `DocumentEditor` instead of `RedlineView`.

**Fix:** Pass a new `onRedFlagOpen` callback from Chat.tsx through MessageBubble that simultaneously sets both `redFlagData` AND opens the file. In Chat.tsx, when a red flag "Open in Editor" is triggered, set `redFlagData` state first, then call `handleFileClick`.

### Bug C: `frozenFileRefs` may not exist on the message type

The auto-open code references `lastAssistant.frozenFileRefs` but the `ChatMessage` interface may not include this field.

**Fix:** Fall back to the current `fileRefs` from the stream hook, and also try to find file refs from the message content or conversation attached files.

## Implementation

### File: `src/pages/Chat.tsx`

1. **Fix auto-open effect** (line 432-451): Remove `promptMode === "red_flags"` guard. Always check for red flags when streaming ends.

2. **Add `handleRedFlagOpen` callback**: Create a new callback that takes `RedFlagData` and a file ref, sets `redFlagData` state, then calls `handleFileClick` to open the document — ensuring the right panel renders `RedlineView` (line 846 condition: `editorDoc && redFlagData`).

3. **Pass `onRedFlagOpen` to MessageBubble**: Wire it through so the "Open in Editor" button triggers the correct flow.

### File: `src/components/chat/MessageBubble.tsx`

1. **Add `onRedFlagOpen` prop**: New optional prop `onRedFlagOpen?: (data: RedFlagData, fileName: string, fileId?: string) => void`.

2. **Wire RedFlagCard's `onOpenInEditor`**: Instead of calling `onFileClick`, call `onRedFlagOpen` with the parsed `redFlagData` plus the file reference.

### File: `src/components/editor/RedlineView.tsx`

No changes needed — it already works correctly when both `editorDoc` and `redFlagData` are set.

## File Changes Summary

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Remove `promptMode === "red_flags"` guard from auto-open effect; add `handleRedFlagOpen` callback; pass it to MessageBubble |
| `src/components/chat/MessageBubble.tsx` | Add `onRedFlagOpen` prop; use it in RedFlagCard's `onOpenInEditor` handler |

