

# Plan: Production-Grade Improvements — Red Flags, Document Editor, Source Clicking, and Agent Quality

## Scope

Five focused areas based on the user's requests, with no destructive changes to existing functionality.

## 1. Red Flag Analysis Tool — Production-Grade

**Current state:** The `red_flags` mode exists in the prompt modes and gets passed to `llm-router`, but there's no dedicated Red Flag UI component. The AI just responds with markdown text. No colored risk highlights, no structured flag rendering, no risk summary table.

**Changes:**

### `src/components/chat/RedFlagCard.tsx` (NEW)
- Renders structured red flag results with 4 risk levels: CRITICAL (red), HIGH (orange), MEDIUM (yellow), LOW (gray)
- Each flag shows: clause text (verbatim), risk level badge, category tag, reason, suggested edit
- Summary header: count by risk level, overall risk score
- Grouped by contract section with collapsible sections
- "Open in Editor" button to view the full document with highlights

### `supabase/functions/llm-router/index.ts`
- Add a dedicated `red_flags` mode prompt that instructs the AI to output a structured JSON block: `<!-- REDFLAGS: title --> \`\`\`json { flags: [...], summary: {...} } \`\`\``
- Each flag includes: `clause_text`, `risk_level`, `category`, `reason`, `suggested_edit`
- The AI reads the full document, not chunks — increase `read_files` text limit from 15000 to 30000 chars for red_flag mode

### `src/components/chat/MessageBubble.tsx`
- Add `detectRedFlags()` function similar to `detectSheet()` that parses the `<!-- REDFLAGS: -->` block
- Render `RedFlagCard` when detected, with a compact card view in the chat bubble

## 2. Multiple Drafts/Docs and Review Tables from One Response

**Current state:** The AI can generate one document or one sheet per response. If a user asks for multiple outputs, only the first is detected.

**Changes:**

### `src/components/chat/MessageBubble.tsx`
- Update `detectDocument` and `detectSheet` to return arrays (detect ALL occurrences of `# Title` sections and `<!-- SHEET: -->` blocks)
- Render multiple compact cards — each clickable to open in the right panel
- Add a "pill row" showing all generated artifacts as clickable chips

### `src/pages/Chat.tsx`
- `handleDocumentOpen` already supports versioning — no change needed
- `handleSheetOpen` already supports versioning — no change needed

## 3. Source/PDF File Click Opens in Right Sidebar

**Current state:** `handleFileClick` fetches the file's `extracted_text` from Supabase and opens it in the DocumentEditor. This already works for file refs in the StepTracker. Need to ensure citations in the References section and inline citations also trigger this.

**Changes:**

### `src/components/chat/MessageBubble.tsx`
- `CollapsibleReferences` already passes `onFileClick` — verify the `displayName` matches what's stored in the `files` table `name` column
- For citations with URLs (web sources), clicking should open the URL in a new tab (already implemented)
- For vault file citations without URLs, clicking the source name opens the document in the sidebar with excerpt highlighting — already wired via `onFileClick` prop

### `src/pages/Chat.tsx`  
- `handleFileClick` already queries files by name and opens in editor — enhance to try a fuzzy match (strip extensions, chunk suffixes) if exact match fails

## 4. Document Editor — Production-Grade Polish

**Current state:** The Quill editor has basic heading support but:
- `markdownToHtml` is very simplistic (no nested lists, no numbered lists, no tables)
- "Show Edits" button is disabled when `currentVersion === 0` which is correct, but the diff computation caps at 500 words which makes it return raw HTML for longer documents
- No visual structure for legal documents (section numbering, defined terms, schedules)

**Changes:**

### `src/components/editor/DocumentEditor.tsx`

**Better `markdownToHtml` converter:**
- Support numbered lists (`1. item` → `<ol><li>`)
- Support nested lists (indented `- item`)
- Support markdown tables (`| col | col |` → `<table>`)
- Support horizontal rules (`---` → `<hr>`)
- Support defined terms in bold
- Preserve section numbering (1.1, 1.2, etc.)

**Better styling:**
- Add CSS for proper legal document appearance:
  - Section numbers aligned left with indented content
  - Defined terms styled distinctly (e.g., slightly bolder, primary color)
  - Signature blocks properly formatted
  - Page margins for print-like feel in the editor
  - Clear visual hierarchy: H1 (document title, large, border-bottom), H2 (section heading), H3 (subsection)

**Fix "Show Edits":**
- Increase the word limit from 500 to 3000 for diff computation
- Use HTML-aware diffing that preserves tag structure

**Better export:**
- Export as `.md` should convert HTML back to proper markdown (not just strip tags)
- Export as `.html` should include proper legal document CSS

## 5. Agent Quality — Better Responses

**Current state:** The system prompt is good but missing several things from the user's specification:
- No self-reprompting of vague queries
- Drafting mode doesn't research before drafting
- No vault inventory prepended to every prompt
- Red flag mode has no specific behavior

**Changes:**

### `supabase/functions/llm-router/index.ts`

**Add red_flag mode prompt (lines ~997):**
```
const redFlagModePrompt = effectiveMode === "red_flags" ? `
You are LawKit AI performing Red Flag Analysis.
Read the ENTIRE document. For each risky clause:
Output using <!-- REDFLAGS: title --> format with JSON:
{"flags": [{"clause_text":"verbatim","risk_level":"CRITICAL|HIGH|MEDIUM|LOW",
"category":"liability|IP|termination|payment|governance|data_protection",
"reason":"why risky","suggested_edit":"specific rewrite"}],
"summary":{"total":N,"critical":N,"high":N,"medium":N,"low":N,"risk_score":N}}
Risk levels:
CRITICAL = must fix before signing
HIGH = strongly recommended to fix
MEDIUM = worth negotiating  
LOW = minor, note only
` : "";
```

**Enhance drafting mode prompt:**
- Add instruction to research jurisdiction requirements before drafting
- Add instruction to include "Drafting Notes" section

**Vault inventory is already prepended** (line 754) — confirm this is working correctly.

**Read full files for red_flag mode:**
- In `toolReadFiles`, increase the `substring(0, 15000)` to `substring(0, 50000)` when mode is `red_flags`

## File Changes Summary

| File | Type | Changes |
|------|------|---------|
| `src/components/chat/RedFlagCard.tsx` | NEW | Structured red flag UI with risk levels, categories, suggested edits |
| `src/components/chat/MessageBubble.tsx` | EDIT | Add `detectRedFlags()`, render RedFlagCard, support multiple doc/sheet detection |
| `src/components/editor/DocumentEditor.tsx` | EDIT | Better markdown→HTML, fix diff cap, legal doc styling, better export |
| `supabase/functions/llm-router/index.ts` | EDIT | Add red_flag prompt, increase file read limit for analysis modes, enhance drafting prompt |
| `src/pages/Chat.tsx` | EDIT | Fuzzy file name matching in `handleFileClick` |

## What is NOT changed

- No removal of any existing functionality
- No changes to database schema
- No changes to auth flow
- No changes to drag-and-drop (already working from last fix)
- No changes to step counter logic (already fixed)
- No changes to session persistence (already implemented)

