

# Comprehensive Fix: Gen UI Persistence, Like/Dislike, Sidebar, Workflows Admin, File Processing Pipeline

## Issues & Changes

### 1. Gen UI Choice Cards Disappear After Selection
**Problem**: `ChoiceCards` and `MultiStepQuestionnaire` only render when `isLastAssistant` is true. When user selects a choice, a new user message is sent, the previous assistant message is no longer "last", so it reverts to plain markdown.

**Fix in `MessageBubble.tsx`**: Remove the `isLastAssistant` guard from choice/questionnaire detection. Instead, track whether a choice was already selected (if the next message in the conversation is a user message matching one of the choices). Render cards as **disabled/selected** state showing which option was picked.

Add a `nextMessage?: ChatMessage` prop to `MessageBubble`. If `nextMessage` exists and its content matches a choice title, render ChoiceCards with that option highlighted and all cards disabled.

### 2. Like/Dislike Solid When Active
**Fix in `ResponseActions.tsx`**: Use `fill="currentColor"` on ThumbsUp/ThumbsDown icons when feedback matches. Change from outline to filled variant.

### 3. Move "Recent" Under "Assistant" in Sidebar
**Fix in `NavigationSidebar.tsx`**: Move the "Recent" chats section to render directly under the "Assistant" nav item (indented like vault sub-items), not as a separate section between Vault and bottom nav.

### 4. Workflows Configurable from Admin Panel
**Problem**: `WORKFLOWS` array is hardcoded in `Home.tsx`.

**Fix**:
- **Admin `AgentTab.tsx`**: Add a "Workflows" sub-tab. Each workflow has: title, description, type, steps count, system prompt, icon selection. CRUD operations save to `api_integrations` with `provider: "workflows_config"`.
- **`Home.tsx`**: Load workflows from `api_integrations` instead of hardcoded array. Fall back to defaults if none configured.

### 5. Full File Processing Pipeline (R2 + OCR + Embeddings + Qdrant)

**New edge function: `supabase/functions/document-processor/index.ts`** (rewrite existing):

The full pipeline:
1. Download file from R2 using `r2_key`
2. Detect if OCR needed (try pdf-parse, check chars/page < 100)
3. Native PDF/DOCX → extract text directly (pdf-parse / mammoth-like approach in Deno)
4. Scanned PDF → AWS Textract `DetectDocumentText` per page
5. Save `extracted.txt` back to R2
6. Split into chunks (configurable size/overlap from agent_config)
7. Embed chunks via OpenAI `text-embedding-3-small`
8. Upsert vectors to Qdrant with metadata (file_id, org_id, chunk_index, page_number, content)
9. Save chunk metadata to `file_chunks` table with `qdrant_point_id`
10. Update file status to `ready`

**Admin panel additions in `AgentTab.tsx`**:
- **OCR tab**: AWS Access Key, Secret Key, Region (stored as secrets via Supabase secrets)
- **Qdrant tab**: Qdrant URL, API Key, Collection name prefix
- **Embeddings**: Already exists (OpenAI embedding model selector) — add OpenAI API key field

**DB migration**: Add columns to `files` table:
- `ocr_used boolean default false`
- `chunk_count integer`
- `extracted_text_r2_key text`

Add columns to `file_chunks` table:
- `qdrant_point_id text`
- `char_start integer`
- `char_end integer`

### 6. Vault Upload → Immediate Processing
**Fix in `Vault.tsx`**: Already triggers `document-processor` after upload. The new processor will handle the full pipeline. Files show "processing" status via realtime subscription, then flip to "ready".

### 7. Prompt Box File Uploads → Same Pipeline
**Fix in `Chat.tsx` / `Home.tsx`**: When files are attached to the prompt box, upload to R2 first, create file records, trigger `document-processor`, then pass `attachedFileIds` to `llm-router`. The router already handles `attachedFileIds`.

### 8. RAG in llm-router → Use Qdrant
**Fix in `llm-router/index.ts`**: Replace the current naive `file_chunks` SELECT with:
1. Embed user query via OpenAI
2. Search Qdrant with org_id filter, top_k=8
3. Fetch matching chunks from `file_chunks` by `qdrant_point_id`
4. Build context from retrieved chunks

---

## File Changes Summary

| File | Change |
|------|--------|
| `MessageBubble.tsx` | Add `nextMessage` prop; render choice cards as disabled/selected for historical messages |
| `ResponseActions.tsx` | Solid fill on active like/dislike icons |
| `NavigationSidebar.tsx` | Move "Recent" under "Assistant" |
| `AgentTab.tsx` | Add Workflows, OCR, Qdrant config sub-tabs |
| `Home.tsx` | Load workflows from DB instead of hardcoded |
| `Chat.tsx` | Pass `nextMessage` to MessageBubble; handle prompt-box file uploads through R2 pipeline |
| `document-processor/index.ts` | Full rewrite: R2 download → OCR detection → Textract/parse → R2 save → chunk → embed → Qdrant upsert |
| `llm-router/index.ts` | Replace naive chunk fetch with Qdrant vector search |
| DB migration | Add `ocr_used`, `chunk_count`, `extracted_text_r2_key` to files; add `qdrant_point_id`, `char_start`, `char_end` to file_chunks |

### Secrets Needed (user will provide via admin panel)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` — for Textract
- `OPENAI_API_KEY` — for embeddings
- `QDRANT_URL`, `QDRANT_API_KEY` — for vector store

These will be stored in `api_integrations` config (encrypted) and read by edge functions at runtime, same pattern as R2/Perplexity configs.

