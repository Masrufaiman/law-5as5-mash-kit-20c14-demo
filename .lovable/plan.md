

# Plan: Fix Drafting, Review Table, Editor Fonts, GenUI Enhancement

## Issues Found

### 1. Drafting outputs raw JSON instead of a document
The 3rd image shows the AI returning a JSON extraction object `{"effective_date": {...}, "party_1_name": {...}}` instead of a properly formatted NDA document. Root cause: the `drafting` prompt mode likely isn't being set correctly, or the AI is defaulting to extraction behavior. The `basePrompt` says "When the user's query implies document creation, produce the full document" but when `promptMode=drafting`, the system prompt should enforce document generation. Currently `agentConf.prompts.drafting` may be empty or not set, falling through to the base prompt which doesn't strongly enforce drafting over extraction.

**Fix**: Add a dedicated `drafting` mode prompt in the llm-router that explicitly instructs: "Generate a complete, properly formatted legal document. NEVER output JSON extraction data. Use the user's provided details to fill in all fields."

### 2. Review table AI fill not working
The `column_fill` use case (lines 180-262 of llm-router) extracts data using ONLY file names — it sends `fileNames` list to the AI with no actual document content. The AI has zero context about what's in the files, so it can only guess from file names. 

**Fix**: When `column_fill` is called, load the actual `extracted_text` from the `files` table for each file and include it in the prompt. This gives the AI real document content to extract from.

### 3. App fonts not used in Quill editor
The app uses Playfair Display, Instrument Sans, and IBM Plex Mono (from `index.css` line 1). The Quill editor registers Inter, Georgia, etc. but not the app's own fonts.

**Fix**: Replace the font whitelist in `DocumentEditor.tsx` with app fonts: Instrument Sans, Playfair Display, IBM Plex Mono (plus keeping serif/monospace defaults).

### 4. New GenUI pattern (image 2)
Harvey shows inline badges within option text: `Yes, choose [10-K] from [EDGAR icon]`. Currently `ChoiceCards` renders plain text options.

**Fix**: Enhance `ChoiceCards` to detect and render inline badges/chips within option text using a pattern like `{badge:10-K}` or markdown-style backticks.

### 5. Follow-up questions
Already implemented via `>>FOLLOWUP:` pattern in llm-router. The AI should be generating these. If it's not, the system prompt already requests it. No code change needed — this works.

## Changes

### File: `supabase/functions/llm-router/index.ts`
1. **Fix drafting mode** (around line 620-627): Add a dedicated `draftingModePrompt` similar to `reviewModePrompt` that forces full document generation, never JSON output.
2. **Fix column_fill** (lines 180-262): Before calling the AI, load `extracted_text` from the `files` table for each file name. Include truncated document content (first 3000 chars per file) in the extraction prompt so the AI has real data to extract from.

### File: `src/components/editor/DocumentEditor.tsx`
- Replace font whitelist with app fonts: Instrument Sans (default), Playfair Display, IBM Plex Mono, plus serif/monospace fallbacks.
- Update the `<style>` block and Quill font registration.

### File: `src/components/chat/ChoiceCards.tsx`
- Add inline badge rendering: detect backtick-wrapped text within options and render as `<Badge>` components with optional icons.
- Style to match Harvey's card layout (bordered cards with inline chips).

## Summary of Files

| File | Changes |
|------|---------|
| `llm-router/index.ts` | Add drafting mode prompt; load file content for column_fill |
| `DocumentEditor.tsx` | Use app fonts (Instrument Sans, Playfair Display, IBM Plex Mono) |
| `ChoiceCards.tsx` | Render inline badges within choice option text |

