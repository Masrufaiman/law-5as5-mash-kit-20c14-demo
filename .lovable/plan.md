

# Fix: AI Response Quality, False Choice Cards, and Vector Search

## Problems Identified

1. **Choice cards rendering on data responses** — `parseChoices` triggers on ANY numbered bold list, so when the AI lists documents with amounts (e.g., "1. **Al-Baith_Shop...** — 2100 BDT"), it renders as clickable selection cards instead of plain text. This is the core UX problem visible in all 3 screenshots.

2. **Vector search failing, fallback truncates content** — Qdrant search fails ("Vector search failed — using fallbackD"), and the fallback loads only 3000 chars per file (line 260 of llm-router). For multi-page invoices, critical data gets cut off.

3. **No thinking/reasoning/steps visible** — The system prompt doesn't instruct the model to use `<think>` tags, and the "Generating response" step is the only step most queries produce. The AI needs explicit instruction to reason through document analysis.

4. **System prompt produces low-quality analysis** — The prompt doesn't instruct the AI to extract structured data from documents, calculate totals, or analyze tables. It defaults to vague summaries.

## File Changes

### 1. `src/components/chat/ChoiceCards.tsx` — Fix false positive detection

The `parseChoices` function needs stronger heuristics to avoid triggering on data/analysis content:

- **Add content-type check**: If numbered items contain monetary values (`$`, `USD`, `BDT`, `₹`, numbers with decimals), amounts, dates, or file extensions (`.pdf`, `.docx`), treat as **data listing, not choices**
- **Add question detection**: Only trigger choice cards if the preamble or surrounding text contains a question mark or explicit "choose/select/pick" language
- **Increase minimum description requirement**: Require at least 2 choices to have non-empty descriptions that look like action descriptions, not data values

```typescript
// Add at top of parseChoices, after collecting choices:
const hasMonetaryValues = choices.some(c => 
  /[\$₹€£]|USD|BDT|INR|EUR|\d+\.\d{2}/.test(c.title + c.description)
);
const hasFileNames = choices.some(c => /\.\w{2,4}\b/.test(c.title));
const hasQuestion = /\?|choose|select|pick|which.*would/i.test(preamble);

if ((hasMonetaryValues || hasFileNames) && !hasQuestion) return null;
```

### 2. `supabase/functions/llm-router/index.ts` — Fix vault context and system prompt

**Increase fallback text limit** (line 260):
```typescript
// Change from 3000 to 15000 chars per file
.map((f, i) => `### [${i + 1}] ${f.name}\n${f.extracted_text?.substring(0, 15000)}`)
```

**Fix vault file query** (line 180): Remove `status: "ready"` filter in vector search file ID lookup so it includes files in any status that have been processed:
```typescript
// Remove .eq("status", "ready") — include any file in the vault
const { data: vaultFiles } = await adminClient
  .from("files")
  .select("id")
  .eq("vault_id", vaultId)
  .eq("organization_id", orgId);
```

**Upgrade system prompt** — Add explicit instructions for document analysis:
```
- When analyzing documents from the vault, extract ALL relevant data including tables, amounts, dates, and structured information
- When asked for summations or totals, calculate actual numerical totals with clear breakdowns per document
- Use <think> tags to reason through complex analysis before presenting results
- Do NOT present document listings as numbered options for the user to select. Present your analysis directly.
- When multiple documents are provided, analyze ALL of them comprehensively — do not ask the user to pick one
- For financial documents, extract exact amounts, currencies, and provide conversions when relevant
```

**Add `<think>` instruction** — Tell the model to use think tags for reasoning:
```
- For complex queries involving calculations, comparisons, or multi-document analysis, wrap your reasoning in <think>...</think> tags before the final answer
```

### 3. `src/components/chat/MultiStepQuestionnaire.tsx` — Tighten detection

Add the same monetary/filename guards to `parseMultiStepQuestions` to prevent false triggering on data content.

### 4. `supabase/functions/llm-router/index.ts` — Add explicit vault analysis step

When vault files are loaded (either via Qdrant or fallback), add a step indicating how many files and total chars of context were loaded, so the user sees meaningful progress.

## Summary

| File | Change |
|------|--------|
| `ChoiceCards.tsx` | Add monetary value, filename, and question-detection guards to prevent false choice UI |
| `MultiStepQuestionnaire.tsx` | Same false-positive guards |
| `llm-router/index.ts` | Increase fallback text limit 3K→15K, remove status filter on vault files, upgrade system prompt with analysis/think/no-MCQ instructions |

