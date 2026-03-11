

# Plan: Fix MCQ False Positives, Citations, Sources Display, and Styling

## Issues from Screenshots

1. **MCQ rendering on explanatory numbered lists** — `parseChoices()` matches "1. Shortest Confidentiality Period:" as a choice card even though it's an explanation, not a user selection prompt. The guard `hasQuestion` check fails because the preamble contains "Reasons:" which isn't caught.

2. **Citation popovers not triggering** — The AI outputs `[*1]`, `[*2]` etc (asterisk format) but `CITATION_PATTERN` regex only matches `[1]` or Unicode superscripts. The `[*N]` pattern is never matched.

3. **Sources show "Source 1" instead of filenames** — Doc citations in the StepTracker show generic "Source N" labels. The backend emits chunk-level source names. Sources should display actual document filenames (e.g., "NDA_TechNova_Solutions.docx").

4. **StepTracker styling issues** — Line-through on completed plan items; background/padding/border on the reasoning container; blue check icons instead of theme primary color.

5. **Response text needs more line height** — Markdown content is too dense.

## Changes

### `src/components/chat/ChoiceCards.tsx` — Stronger false-positive guard

Add patterns to reject numbered lists that are explanatory (contain "Reasons:", "Analysis:", long descriptions with file references). Add a `hasExplanatoryPattern` check: if items contain `.docx`, `.pdf`, long multi-sentence descriptions (>150 chars), or the preamble ends with "Reasons:" — return `null`.

### `src/components/chat/MessageBubble.tsx` — Fix citation regex + line height

- Extend `CITATION_PATTERN` to also match `[*N]` and `[**N**]` formats (the asterisk-wrapped citation style)
- Update `injectCitations` to parse `[*1]` → index 1
- Increase prose line height: add `prose-p:leading-7` and `prose-li:leading-7` to the markdown container

### `src/components/chat/StepTracker.tsx` — Styling fixes

- Remove `line-through` from completed plan items (line 204)
- Remove `bg-muted/30 border border-border/40 p-3` from the outer container (line 129) — make it transparent with no padding
- Replace all `text-agent-blue` with `text-primary` for check/tick icons throughout
- Sources section: show actual filenames from citations, not "Source N". Parse `c.source` to extract filename if it contains chunk metadata

### `src/components/chat/CitationPopover.tsx` — Show document filenames

Update the source display to extract the actual filename from the citation source string (strip chunk suffixes like " · chunk 3").

## Files Modified

| File | Changes |
|------|---------|
| `src/components/chat/ChoiceCards.tsx` | Add explanatory-list false positive guard |
| `src/components/chat/MessageBubble.tsx` | Extend citation regex for `[*N]` format; increase line height |
| `src/components/chat/StepTracker.tsx` | Remove line-through, bg/padding/border; use `text-primary` for ticks; show real filenames in sources |
| `src/components/chat/CitationPopover.tsx` | Extract filename from chunk-level source strings |

