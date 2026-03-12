

# Plan: 4 Fixes — Review Table Grounding, Tool Priority, Red Flag Document Experience

## 1. Review Table: Per-Document Grounding for Multi-Doc Extraction

**Problem:** LP1 extracts correctly but LP2's governing law hallucinates "New York" when the document says "England and Wales." The grounding rule applies once at the start, not per-document.

**Fix in `supabase/functions/llm-router/index.ts` (reviewModePrompt, line 1133-1177):**

Add Rule 5 — Per-Document Independence:
```
### Rule 5 — Per-Document Independence (prevents context drift)
Apply ALL grounding rules independently for EACH document. Do not let the extraction from document 1 influence document 2.
Do not infer any document's governing law from LP identity, address, or nationality.
Each document must be read as if it is the only document.

### Rule 6 — Self-Verification (prevents hallucination)
After extracting governing law from each document, state the verbatim sentence you found in a "verification" field.
If the verbatim sentence does not contain the jurisdiction you extracted, your extraction is wrong — re-read the document.
```

Update the SHEET JSON format to include a `verification` field per row for governing law columns.

## 2. CourtListener Tool Priority + Conversation Context + Preamble Removal

**Problem:** CourtListener is selected but never called — it's only a domain filter for Perplexity, not a direct API tool. The agent says "I don't have sufficient information" then immediately searches. Short follow-ups lose context.

### Fix A: Source-aware tool priority (line 848-863)
When `sources` includes "CourtListener", force `web_search` as first tool with CourtListener domain filter applied. Currently, if `hasVault` is true, vault gets priority over web search. Add a check:

```typescript
// If legal research sources are explicitly selected and query contains case/court refs
const hasExplicitLegalSources = sources?.some(s => ["CourtListener", "US Law", "UK Law"].includes(s));
const isCaseQuery = /case|v\.\s|vs?\.\s|court|appeal|ruling|judgment|citation|\d+\s+(So|F|U\.S|S\.Ct)/i.test(message);

if (hasExplicitLegalSources && isCaseQuery && perplexityKey) {
  nextTool = "web_search"; // Skip vault entirely for case law queries with explicit sources
}
```

### Fix B: Remove preamble (base prompt, line 580-615)
Add to `getLawKitBasePrompt`:
```
- NEVER start a response with "I don't have sufficient information" or "My internal knowledge base does not contain." If tools are available, use them silently and return the answer. Never announce what you cannot do.
```

### Fix C: Conversation context for short follow-ups (line 500-510 in analyzeIntent)
Add to intent analysis system prompt:
```
- If the user message is short or ambiguous (under 10 words), resolve it against the conversation history before treating it as a new query. Combine the previous topic with the new message to form a complete query.
```

Also in the ReAct loop: if `message.split(" ").length < 6` and `conversationHistory.length > 0`, prepend the last assistant message summary to the search query.

**File:** `supabase/functions/llm-router/index.ts`

## 3. Red Flag: Auto-Open Document + Redline Suggestions with Approve/Reject

**Problem:** Document doesn't auto-open after red flag analysis. "Open in Editor" button not working. User wants inline redline suggestions with approve/reject controls.

### Fix A: Auto-open document after red flag analysis
In `Chat.tsx`, after streaming completes for `red_flags` mode, auto-trigger `handleFileClick` for the first attached file to open it in the right panel.

### Fix B: "Open in Editor" already calls `onFileClick` (line 600-604 in MessageBubble.tsx) 
The issue is likely that `fileRefs` is empty when the force-finish guard skips the monologue. The `file_refs` SSE event is emitted at line 903 from `toolReadFiles`. Verify this works — if `fileRefs` is not being passed, ensure the SSE event reaches the frontend state.

### Fix C: Redline view in DocumentEditor
Create a new component `RedlineDocumentEditor` or extend `DocumentEditor.tsx`:

1. When red flag data exists alongside the document, render the document with **strikethrough red text** on flagged clauses and **green suggested edits** below each
2. Each flagged clause gets an "Accept" / "Reject" button pair
3. "Accept All" button at the top of the document
4. Accepting replaces the flagged clause with the suggested edit in the document content
5. Rejecting removes the redline markup for that clause

**Implementation:**
- Parse `RedFlagData` alongside document content
- Find each `clause_text` in the document using fuzzy string matching
- Wrap matched sections in redline markup
- Store accept/reject state per flag
- On "Accept All", apply all suggested edits and update the document

**New component:** `src/components/editor/RedlineView.tsx`

**Changes to `Chat.tsx`:** When red flag analysis completes, pass both the document content AND the red flag data to the editor panel. Add a `redFlagData` state that gets set when red flag SSE completes.

**Changes to right panel rendering:** If `redFlagData` exists alongside `editorDoc`, render `RedlineView` instead of `DocumentEditor`.

## 4. File Changes Summary

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Review table Rules 5-6; source-aware tool priority; remove preamble instruction; short follow-up context resolution |
| `src/pages/Chat.tsx` | Auto-open document after red flag analysis; pass redFlagData to editor panel; handle redline state |
| `src/components/editor/RedlineView.tsx` | **New** — Document viewer with strikethrough flagged clauses, green suggested edits, per-clause Accept/Reject buttons, Accept All |
| `src/components/chat/RedFlagCard.tsx` | Remove "Open in Editor" button (document auto-opens instead) |

## Implementation Order

1. `llm-router` prompt fixes (review grounding, tool priority, preamble, context)
2. Auto-open document after red flag analysis
3. RedlineView component
4. Wire redline into Chat.tsx right panel

