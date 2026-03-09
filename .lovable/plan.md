

# Inline Citation Popovers

## Problem
Citations render as a row of numbered badges at the bottom of the response. The AI response contains `[1]`, `[2]` etc. inline in the text, but they render as plain text. Users expect clicking `[2]` inline to show the citation popover right there.

## Approach

### `MessageBubble.tsx`
1. **Pre-process content**: Before passing to `ReactMarkdown`, replace `[N]` patterns (where N matches a citation index) with a placeholder like `<cite-N/>`.
2. **Custom rendering**: Instead of passing raw markdown to ReactMarkdown, split the rendered text nodes to detect `[N]` patterns and render `<CitationPopover>` inline at each occurrence.
3. **Remove the bottom citations block** — since they now appear inline.

The cleanest approach: post-process the React tree from ReactMarkdown. Since ReactMarkdown renders `[1]` as plain text inside `<p>` elements, we'll add a custom text node handler that splits text on `/\[(\d+)\]/g` and injects `<CitationPopover>` components inline.

### Implementation Detail

Create a helper `renderWithInlineCitations(text: string, citations: Citation[])` that:
- Splits text by `/\[(\d+)\]/g`
- For each match, looks up the citation by index
- Returns an array of `[textFragment, <CitationPopover/>, textFragment, ...]`

Then wrap all text-containing ReactMarkdown components (`p`, `li`, `td`, `th`, `blockquote`, headings) to process their children through this helper.

### Files Changed

| File | Change |
|------|--------|
| `MessageBubble.tsx` | Add inline citation rendering in text nodes, remove bottom citation block |

