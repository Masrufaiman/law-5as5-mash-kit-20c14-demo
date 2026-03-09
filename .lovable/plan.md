

# Fix: Vault Processing Pipeline, Citation Rendering, Sidebar Actions, Sources Footer, Follow-ups

## Root Cause Analysis

### Vault Upload Issue
The file `5482099092.pdf` is stuck at "processing" — the `document-processor` edge function has **zero logs**, meaning it was never successfully invoked or is not deployed. The code in `Vault.tsx` calls `supabase.functions.invoke("document-processor")` fire-and-forget. The function itself is correct but likely needs redeployment. The pipeline chain (R2 → OCR → embed → Qdrant) depends on all configs being set in Admin. If any config is missing (R2, OpenAI, Qdrant), the function still runs but skips those steps.

**Fix**: Ensure the edge function is deployed. Add better error handling and status feedback. Also add a "Retry processing" button for stuck files.

### Citation Rendering Issue  
The AI (Gemini via Perplexity context) outputs **Unicode superscript numbers** like `¹ ² ³ ⁴` instead of `[1] [2]` bracket notation. The `injectCitations` regex only matches `/\[(\d+)\]/g`. These superscripts pass through unprocessed.

**Fix**: Expand the citation regex in `MessageBubble.tsx` to also match superscript Unicode characters (`¹²³⁴⁵⁶⁷⁸⁹⁰`) and map them to citation popovers. Also update `extractCitations` in `llm-router` to detect superscript refs.

### Sources Footer Issue
The "Sources:" text block at the bottom comes from the AI response itself (Perplexity context includes source URLs). The `stripCitationsBlock` regex partially strips it but the format `Sources: [¹] Web: Indeed.com — What Is Employment Law?` doesn't match. Need to strip the entire `Sources:` block and instead render a proper `SourcesFooter` component with favicons and URLs.

---

## File Changes

### `src/components/chat/MessageBubble.tsx`
- **Superscript citation matching**: Update `injectCitations` to split on both `[N]` and Unicode superscripts (`¹²³⁴⁵⁶⁷⁸⁹⁰` and combinations like `[¹, ⁴]`). Map superscript chars to their numeric values.
- **Strip Sources block**: Broaden `stripCitationsBlock` to also catch `Sources: [¹] Web: ...` and `Sources:\n[*] ...` patterns.
- **Sources footer component**: After the message content, render a compact `SourcesFooter` showing favicon + domain URL for each citation that has a URL. Styled like image-50 reference.
- **Follow-up questions**: Detect lines starting with specific patterns at the end of AI responses (or add a `followUps` field). Render as clickable suggestion chips below the response.

### `src/components/chat/CitationPopover.tsx`
- Add `url` field support — show the URL/domain in the popover, with a favicon image via `https://www.google.com/s2/favicons?domain=...`
- Use `HoverCard` instead of `Popover` so it shows on hover AND click

### `src/hooks/useStreamChat.ts`
- Add `url?: string` to `Citation` interface

### `src/components/chat/SourcesFooter.tsx` (NEW)
- Compact row of source pills showing favicon + domain
- Like the reference images: `🌐 Web search and files — 16 cited`
- Clicking expands to show all source URLs with favicons

### `src/components/NavigationSidebar.tsx`
- **Hover actions**: Add `Share` and `Trash2` icons that appear on hover for each recent chat item
- **Delete**: Confirmation dialog, then delete conversation from Supabase
- **Share**: Same share logic as Chat.tsx (generate token, copy URL)
- **Scrollable**: Wrap recent chats in a `ScrollArea` with `max-h-48` so they scroll after ~8 items

### `supabase/functions/llm-router/index.ts`
- **Fix `extractCitations`**: Also match superscript numbers `¹²³⁴⁵⁶⁷⁸⁹⁰` in addition to `[N]`
- **Pass URLs from Perplexity citations**: The `perplexityCitations` already have `url` field — ensure it's included in the final `allCitations` sent to frontend
- **Add follow-up generation**: After streaming completes, parse or generate 3-4 follow-up question suggestions and send as a `followUps` SSE event

### `supabase/functions/document-processor/index.ts`
- Add more robust error logging at each step
- If R2 download fails, update file status to "error" with a clear message
- Ensure the function is re-deployed (editing triggers auto-deploy)

### `src/pages/Vault.tsx`
- Add a "Retry" button for files stuck in "processing" or "error" status
- The button re-invokes `document-processor`

---

## Summary

| File | Change |
|------|--------|
| `MessageBubble.tsx` | Superscript citation support, broader strip regex, sources footer, follow-ups |
| `CitationPopover.tsx` | HoverCard with favicon + URL, hover + click |
| `SourcesFooter.tsx` | New: favicon + domain pills for web sources |
| `useStreamChat.ts` | Add `url` to Citation, add `followUps` to stream |
| `NavigationSidebar.tsx` | Share/delete hover icons, scrollable recents |
| `llm-router/index.ts` | Superscript extraction, pass URLs, follow-up suggestions |
| `document-processor/index.ts` | Better error logging, re-deploy trigger |
| `Vault.tsx` | Retry button for stuck files |

