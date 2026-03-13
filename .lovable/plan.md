

# Plan: Red Flag Redline Auto-Open + Accept/Decline UX + Mistral OCR HTML Format

## Changes

### 1. Mistral OCR → HTML format (`supabase/functions/document-processor/index.ts`)

**Current**: `include_image_base64: false`, no `table_format` field.
**Fix**: Set `include_image_base64: true` and add `table_format: "html"` to the OCR request body. Update the text extraction to handle HTML table content from the response.

### 2. Red Flag Auto-Open — Fix the actual bug (`src/pages/Chat.tsx`)

**Current bug**: `handleRedFlagOpen` at line 683 calls `setRedFlagData(data)` then `handleFileClick(fileName, fileId)`. But `handleFileClick` is async and only sets `editorDoc` if `extracted_text` is found. If the file is still processing or name doesn't match, `editorDoc` stays null and the right panel never opens because the render condition is `editorDoc && redFlagData` (line 916).

**Fix**: Replace `handleRedFlagOpen` to use the existing `openRedFlagPanel` helper (line 436) which has the 3-tier fallback chain. Currently `handleRedFlagOpen` doesn't use it — it should.

```typescript
const handleRedFlagOpen = useCallback((data: RedFlagData, fileName: string, fileId?: string) => {
  openRedFlagPanel(data, fileName, fileId);
}, [openRedFlagPanel]);
```

### 3. RedlineView — Live accept/decline with inline replacement (`src/components/editor/RedlineView.tsx`)

The current RedlineView already has accept/reject per flag and shows strikethrough + green text for accepted edits. The issue is:

**A. When accepted, the original text should be visually replaced** — currently it shows both (strikethrough original + green new) with an undo button. This is actually correct behavior for redline review. But per the user's spec: "the accepted one will automatically remove the red line through portion and add a new portion."

**Fix**: When a flag is accepted, after a brief 1-second animation showing the strikethrough, transition to showing ONLY the suggested edit text (no strikethrough). Add a small "Undo" icon that appears on hover to revert.

**B. Add risk-colored background highlights** per spec:
- CRITICAL → `bg-[#FEE2E2]` with `border-l-[3px] border-l-[#DC2626]`
- HIGH → `bg-[#FEF3C7]` with `border-l-[3px] border-l-[#F59E0B]`
- MEDIUM → `bg-[#FEF9C3]` with `border-l-[3px] border-l-[#EAB308]`
- LOW → `bg-[#F0FDF4]` with `border-l-[3px] border-l-[#22C55E]`

**C. Add hover tooltip** showing reason + suggested edit on each flagged clause. The current tooltip uses `group-hover` but the parent span doesn't have `group` class.

**D. Add toolbar** with risk counts badges at top.

### 4. Flag card click → scroll sync (`src/components/editor/RedlineView.tsx` + `src/pages/Chat.tsx`)

Add `activeFlagIndex` prop to RedlineView. When a flag card is clicked in the left panel (MessageBubble's RedFlagCard), call a callback that sets the active flag index. RedlineView scrolls to that clause with a pulse animation.

This requires:
- Adding `onFlagClick` callback to `RedFlagCard` component
- Adding `activeFlagIndex` prop to `RedlineView`
- Using `useRef` + `scrollIntoView` on flag segments
- CSS pulse animation class

## File Changes

| File | Changes |
|------|---------|
| `supabase/functions/document-processor/index.ts` | Add `include_image_base64: true` and `table_format: "html"` to Mistral OCR request |
| `src/pages/Chat.tsx` | Fix `handleRedFlagOpen` to use `openRedFlagPanel`; add `activeFlagIndex` state; pass flag click handler |
| `src/components/editor/RedlineView.tsx` | Risk-colored highlights; accepted = show only new text after animation; hover tooltip fix; toolbar with risk counts; scroll-to-flag with pulse; `activeFlagIndex` prop |
| `src/components/chat/RedFlagCard.tsx` | Add `onFlagClick(index)` callback prop to individual flag items |

