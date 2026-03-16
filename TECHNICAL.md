# LawKit AI — Technical Architecture

> Comprehensive system documentation for the LawKit AI legal intelligence platform.  
> Last updated: 2026-03-16

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Multi-Tenancy & Organization Isolation](#3-multi-tenancy--organization-isolation)
4. [AI Agent Architecture (llm-router)](#4-ai-agent-architecture-llm-router)
5. [Prompt Modes](#5-prompt-modes)
6. [Search & Research Pipeline](#6-search--research-pipeline)
7. [Deep Research](#7-deep-research)
8. [Document Processing Pipeline](#8-document-processing-pipeline)
9. [Storage Architecture (Cloudflare R2)](#9-storage-architecture-cloudflare-r2)
10. [Vault System](#10-vault-system)
11. [RAG Pipeline (Qdrant)](#11-rag-pipeline-qdrant)
12. [Citation System](#12-citation-system)
13. [Streaming SSE Protocol](#13-streaming-sse-protocol)
14. [Workflow System](#14-workflow-system)
15. [Review Tables](#15-review-tables)
16. [Red Flag Analysis](#16-red-flag-analysis)
17. [Conversation Persistence & UI Hydration](#17-conversation-persistence--ui-hydration)
18. [Admin Panel](#18-admin-panel)
19. [API Key Security](#19-api-key-security)
20. [UI Architecture](#20-ui-architecture)
21. [Database Schema](#21-database-schema)
22. [Edge Functions](#22-edge-functions)
23. [Environment & Deployment](#23-environment--deployment)

---

## 1. System Overview

LawKit AI is a **multi-tenant legal AI platform** that enables law firms and legal teams to research, draft, review, and analyze legal documents using AI agents with access to real-time legal databases, uploaded documents, and organizational knowledge.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | React Query + Local state + localStorage |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions) |
| File Storage | Cloudflare R2 (AWS S3-compatible) |
| Vector DB | Qdrant Cloud |
| AI Gateway | Lovable AI Gateway → OpenAI / Anthropic / Google / Mistral |
| OCR | Mistral OCR API |
| Embeddings | OpenAI text-embedding-3-small |
| Legal Search | Perplexity (sonar/sonar-pro/sonar-deep-research), CourtListener, EDGAR, EUR-Lex |

### Architecture Diagram (Conceptual)

```
┌─────────────┐     SSE Stream      ┌──────────────────┐
│  React SPA  │◄────────────────────►│  llm-router      │
│  (Vite)     │     HTTP POST        │  (Edge Function)  │
└──────┬──────┘                      └────────┬─────────┘
       │                                      │
       │ Supabase Client                      │ Service Role
       ▼                                      ▼
┌─────────────┐                      ┌──────────────────┐
│  Supabase   │                      │  External APIs   │
│  PostgreSQL │                      │  - Perplexity    │
│  Auth       │                      │  - CourtListener │
│  RLS        │                      │  - EDGAR (SEC)   │
└─────────────┘                      │  - EUR-Lex       │
                                     │  - Mistral OCR   │
┌─────────────┐                      │  - OpenAI Embed  │
│ Cloudflare  │◄─────────────────────│  - Qdrant        │
│ R2 Storage  │  AWS SigV4           └──────────────────┘
└─────────────┘
```

---

## 2. Authentication & Authorization

### Supabase Auth

- **Provider**: Supabase Auth with email/password (extensible to OAuth)
- **Session**: JWT-based, persisted in `localStorage`, auto-refreshed via `autoRefreshToken: true`
- **Client**: `src/integrations/supabase/client.ts` — single shared `createClient<Database>` instance

### Role System

Roles are stored on the `profiles` table as an `app_role` enum:

| Role | Access |
|------|--------|
| `member` | Standard user — chat, vault, review, documents |
| `admin` | Organization admin — manage org settings, users |
| `superadmin` | Platform admin — full admin panel access, cross-org visibility, user role management |

### Key Database Functions

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger on `auth.users` INSERT — creates `profiles` row with `role = 'member'` |
| `promote_org_creator(_user_id, _org_id)` | SECURITY DEFINER — promotes org creator to `admin` during onboarding |
| `has_role(_user_id, _role)` | SECURITY DEFINER — checks if user has a specific role (used in RLS) |
| `is_org_admin(_user_id)` | Returns true if role is `admin` OR `superadmin` |
| `is_superadmin(_user_id)` | Returns true if role is `superadmin` |
| `get_user_org_id()` | SECURITY DEFINER — returns `organization_id` for current `auth.uid()` |

### RLS Anti-Escalation

The `profiles` UPDATE policy prevents self-role-escalation:

```sql
WITH CHECK (
  role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
  AND NOT (organization_id IS DISTINCT FROM 
    (SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid()))
)
```

Users cannot change their own `role` or `organization_id`.

### Auto-Superadmin

`mashcatg@gmail.com` is designated as the initial superadmin. From the admin panel, superadmins can promote/demote other users.

---

## 3. Multi-Tenancy & Organization Isolation

Every data table includes an `organization_id` column. RLS policies enforce tenant isolation using the `get_user_org_id()` SECURITY DEFINER function:

```sql
-- Example: files table SELECT policy
USING (organization_id = get_user_org_id())
```

This function executes with definer privileges (bypassing RLS on `profiles`) to safely retrieve the caller's org without recursion.

### Superadmin Cross-Org Access

Superadmins have `ALL` policies on `organizations` and `profiles` tables, plus explicit `OR is_superadmin(auth.uid())` on `knowledge_entries`, `audit_logs`, etc.

### Organization Lifecycle

1. User signs up → `handle_new_user()` creates profile with `role = 'member'`
2. Onboarding page → user creates organization → `promote_org_creator()` sets `role = 'admin'`
3. Admin invites users via email → new users join the org during onboarding

---

## 4. AI Agent Architecture (llm-router)

The `llm-router` edge function is the central AI orchestrator. It implements a **ReAct (Reasoning + Acting) execution loop** with planning, tool use, inner monologue, self-verification, and streaming output.

### Request Lifecycle

```
1. Authentication & Profile Resolution
2. Configuration Loading (LLM configs, agent config, API keys)
3. Fast-Path Check (bypass planning for simple greetings)
4. Intent Analysis (structured tool calling → task type, jurisdictions, plan)
5. User Message Persistence (Phase 2.5 — early insert before tool loop)
6. ReAct Tool Loop (up to 20 iterations)
7. Inner Monologue (after each tool: assess confidence, decide next action)
8. Self-Verification (optional quality gate)
9. Final Synthesis (streaming LLM completion)
10. Metadata Persistence (frozen steps, plan, citations, file refs)
```

### Request Type Classification

Hard-coded routing classifies each message into 6 types:

| Type | Trigger | Initial Tool |
|------|---------|-------------|
| 1 — Factual | Default | `web_search` (if complex) |
| 2 — Case Lookup | `v.` patterns, CourtListener source | `courtlistener` |
| 3 — Document Task | Attached files or doc references | `read_files` |
| 4 — Vault Task | "from vault", "my vault" | `vault_search` |
| 5 — EDGAR/SEC | SEC/EDGAR/10-K keywords | `edgar` |
| 6 — EUR-Lex | EU regulation keywords | `eurlex` |

### Intent Analysis (Structured Tool Calling)

Uses the LLM's function calling to produce structured intent:

```typescript
{
  task_type: "research" | "draft" | "analyze" | "compare" | "review" | "chat",
  jurisdictions: string[],      // e.g. ["UK", "US"]
  complexity_score: number,     // 0-10
  plan: string[],               // 3-7 specific steps
  needs_vault_search: boolean,
  needs_web_search: boolean,
}
```

### ReAct Execution Loop

```
for iteration 1..20:
  1. Execute current tool (vault_search, web_search, read_files, courtlistener, edgar, eurlex)
  2. Accumulate context + citations
  3. Run Inner Monologue:
     - Assess confidence (high/medium/low)
     - Identify gaps
     - Decide next_action: TOOL | REPLAN | VERIFY | FINISH
     - If REPLAN → emit updated plan, adjust steps
     - If VERIFY → run self-verification
     - If FINISH → break loop
  4. Handle contradictions, escalations, inline data tables
  5. Continue or break
```

### Inner Monologue

After each tool execution, the LLM evaluates:

```typescript
{
  observation: string,           // What was found
  confidence: "high" | "medium" | "low",
  gaps: string[],               // What's still missing
  next_action: "TOOL" | "REPLAN" | "VERIFY" | "FINISH",
  next_tool?: string,           // Which tool to run next
  thinking_narration: string,   // Shown to user as "thinking" animation
  contradiction?: { claim, sourceA, sourceB },
  inline_data?: { headers, rows },
}
```

### Fast-Path Optimization

Simple messages (greetings, short follow-ups, meta-questions) bypass the full planning/ReAct pipeline:

```typescript
const FAST_PATH_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay)\b/i,
  /^(what can you|how do you|who are you)/i,
  // ... 
];
```

Fast-path messages go directly to LLM completion without tool use or planning.

### Model Selection

1. **Primary AI**: Configurable per org via `llm_configs` table. Falls back to Lovable AI Gateway (`google/gemini-2.5-flash`)
2. **Model routing**: Checks org-specific configs first → global configs → gateway fallback
3. **Provider normalization**: Auto-prefixes model IDs (e.g., `gpt-4o` → `openai/gpt-4o`)

### Agent Memory

Per-user persistent memory stored in `agent_memory` table:
- Agent stores facts, preferences, and context across conversations
- Retrieved at start of each turn (up to 10 entries, priority categories first)
- Injected as `## Agent Memory (Known Facts)` into system prompt

---

## 5. Prompt Modes

The frontend sets a `promptMode` that controls the system prompt and output format:

### Chat / Research (default)

Standard legal research mode. Uses `getLawKitBasePrompt()` with:
- Jurisdiction-aware instructions
- Citation format rules (`[1]`, `[2]` sequential integers)
- Organization knowledge injection
- Case law requirements per jurisdiction
- Follow-up question generation (`>>FOLLOWUP: ...`)

### Drafting

Activated via `promptMode = "drafting"`. Key rules:
- Output starts with `# [Document Title]` — no preamble
- Proper legal formatting (numbered sections, defined terms in bold)
- Default jurisdiction: England and Wales (unless specified)
- No placeholder text — fill in all details from context
- Supports multi-document generation in one response
- Ends with `## Drafting Notes` section

### Red Flag Detection

Activated via `promptMode = "red_flags"` or auto-detected from keywords. Output format:

```markdown
<!-- REDFLAGS: [Document Title] -->
```json
{
  "flags": [
    {
      "clause_text": "exact verbatim quote",
      "risk_level": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "liability|IP|termination|...",
      "reason": "explanation",
      "suggested_edit": "rewrite"
    }
  ],
  "summary": {
    "total": N, "critical": N, "high": N, "medium": N, "low": N,
    "risk_score": 0-10
  }
}
```

Critical rules:
- MUST analyze ONLY the provided document content (grounding)
- clause_text must be verbatim from document
- Jurisdiction flagging only when clearly mismatched
- risk_score is holistic (not sum of individual flags)

### Review (Table Extraction)

Activated via `promptMode = "review"`. Uses `<!-- SHEET: -->` format for structured data extraction. See [Section 15: Review Tables](#15-review-tables).

### Custom Prompts

Admins can override mode-specific prompts via the Agent Config tab in the admin panel. Custom prompts are stored in `api_integrations.config.prompts.{mode}`.

---

## 6. Search & Research Pipeline

### Perplexity Integration

Configured via the Search tab in admin (`api_integrations` with `provider = "perplexity"`).

#### Model Tier Selection

Based on complexity score:

| Complexity | Model | Notes |
|-----------|-------|-------|
| 0-2 | `sonar` | Simple factual queries |
| 3-5 | `sonar-pro` | Multi-source legal analysis |
| 6-8 | `sonar-deep-research` | Comprehensive multi-jurisdiction |
| 9-10 or deepResearch=true | `sonar-deep-research` + `reasoningEffort: "high"` | Exhaustive research |

#### Jurisdiction Prefix Routing

Queries are prefixed with jurisdiction context for better search targeting:

```typescript
const JURISDICTION_PREFIX = {
  "UK": "UK law England Wales:",
  "US": "US law federal:",
  "EU": "European Union law:",
  "UAE": "UAE DIFC ADGM law:",
  "Singapore": "Singapore law MAS:",
  // ...
};
```

#### Domain Filtering

Search results are filtered by source-specific domains:

```typescript
const SOURCE_DOMAIN_MAP = {
  "US Law": ["law.cornell.edu", "supremecourt.gov", "uscourts.gov"],
  "UK Law": ["legislation.gov.uk", "judiciary.uk", "bailii.org"],
  "CourtListener": ["courtlistener.com"],
  "EDGAR (SEC)": ["sec.gov", "edgar.sec.gov"],
  // ...
};
```

### Multi-Query Decomposition

Each search is decomposed into 2-4 targeted sub-queries based on the tool type:

- **CourtListener**: Extracts case names (Party v Party), legal doctrines, jurisdiction-specific variants
- **EDGAR**: Extracts company names, form types (10-K, 10-Q), date-specific variants
- **EUR-Lex**: Known regulation terms (GDPR, AI Act), CELEX references, article-specific queries
- **Web Search**: Original query + jurisdiction angle + focused sub-query for complex queries

### CourtListener

REST API integration for US case law:
- Endpoint: `https://www.courtlistener.com/api/rest/v3/search/`
- Returns up to 8 results with case names, courts, dates, snippets
- Optional API key authentication (works without key too)

### EDGAR (SEC)

Multi-strategy SEC filing search:
1. **EFTS full-text search** (`https://efts.sec.gov/LATEST/search-index`)
2. **CIK-based lookup** for known companies (Apple, Microsoft, Tesla, etc.)
3. **Company search Atom feed** fallback

Known CIK mapping:
```typescript
const CIK_MAP = {
  apple: "0000320193",
  microsoft: "0000789019",
  tesla: "0001318605",
  // ...
};
```

### EUR-Lex

EU legislation search with two strategies:
1. **Known CELEX lookup** — direct fetch for known regulations (GDPR → `32016R0679`, AI Act → `32024R1689`, etc.)
2. **HTML search fallback** — scrapes EUR-Lex search results page

---

## 7. Deep Research

Activated by the "Deep Research" toggle in the chat UI.

### Behavior Changes

- Forces `sonar-deep-research` model with `reasoningEffort: "high"`
- Expanded query decomposition (more sub-queries per tool)
- Higher max_tokens for synthesis (16,000 vs 8,000)
- More aggressive cross-referencing in inner monologue

### Frontend Toggle

```typescript
// Chat.tsx state
const [deepResearch, setDeepResearch] = useState(false);

// Sent to llm-router
body: { deepResearch: true }
```

---

## 8. Document Processing Pipeline

The `document-processor` edge function handles file ingestion:

### Pipeline Steps

```
1. Download file from Cloudflare R2
2. Extract text:
   - PDF → Mistral OCR API (base64 upload, markdown output)
   - DOCX → ZIP/XML parsing (deflate-raw decompression, word/document.xml extraction)
   - Plain text → direct decode
   - Images → Mistral OCR
3. Sanitize (remove null bytes for PostgreSQL)
4. Save extracted text to R2 (extracted.txt)
5. Chunk text (configurable size/overlap, default 1000/200)
6. Embed chunks via OpenAI embeddings API
7. Upsert vectors to Qdrant (org-scoped collection)
8. Save chunks to Supabase (file_chunks table)
9. Update file status (ready/error)
```

### DOCX Extraction

```typescript
async function extractDocxText(fileBuffer: Uint8Array): Promise<string> {
  // DOCX is a ZIP file containing word/document.xml
  // Uses DecompressionStream("deflate-raw") for ZIP entry decompression
  // Extracts text from XML tags: <w:t>, <w:tab>, <w:br>, <w:p>
}
```

### Error Handling

- If extraction produces empty text → `status = "error"` with descriptive `error_message`
- Never marks a file as `ready` with empty content
- File status enum: `uploading` → `processing` → `ready` | `error`

### Polling for Readiness

The `toolReadFiles` function in llm-router polls up to 30 seconds for newly uploaded files to finish processing:

```typescript
if (attachedFileIds?.length && files.every(f => !f.extracted_text)) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    // re-query files...
    if (refreshed.some(f => f.extracted_text)) break;
  }
}
```

---

## 9. Storage Architecture (Cloudflare R2)

LawKit uses **Cloudflare R2** (S3-compatible) for file storage instead of Supabase Storage.

### Edge Functions

| Function | Purpose |
|----------|---------|
| `r2-upload` | Authenticated file upload via multipart form data |
| `r2-download` | Authenticated download / pre-signed URL generation |

### AWS Signature V4

Both functions implement full **AWS4-HMAC-SHA256** signing:

```typescript
async function signedR2Request(method, url, config, body, contentType?) {
  // 1. Hash payload (SHA-256)
  // 2. Build canonical request (method, URI, query, headers)
  // 3. Create string to sign (date, credential scope, canonical hash)
  // 4. Derive signing key (PBKDF → dateKey → regionKey → serviceKey)
  // 5. Calculate HMAC signature
  // 6. Send with Authorization header
}
```

### R2 Configuration

Stored in `api_integrations` with `provider = "cloudflare_r2"`:

```json
{
  "account_id": "...",
  "access_key_id": "...",
  "secret_access_key": "...",
  "bucket_name": "...",
  "region": "auto",
  "endpoint_url": "https://{account_id}.r2.cloudflarestorage.com",
  "public_url": "https://..."  // optional CDN URL
}
```

### File Path Convention

```
{organization_id}/{vault_id}/{file_uuid}-{sanitized_filename}
```

---

## 10. Vault System

Vaults are organization-scoped containers for document collections.

### Schema

```sql
vaults: id, name, description, organization_id, created_by, created_at, updated_at
files: id, name, original_name, mime_type, size_bytes, storage_path, vault_id, 
       organization_id, uploaded_by, status, extracted_text, chunk_count, ...
```

### Special Vaults

- **Uploads**: Auto-created vault for documents attached directly in chat
- Named vaults: Created by users in the Vault page

### Vault Sharing

Via `vault_shares` table:
```sql
vault_shares: id, vault_id, shared_by, shared_with_email, permission, created_at
```

### Realtime Subscriptions

The sidebar subscribes to vault changes via Supabase Realtime:

```typescript
const vaultChannel = supabase
  .channel("sidebar-vaults")
  .on("postgres_changes", { event: "*", schema: "public", table: "vaults" }, () => {
    loadVaults();
  })
  .subscribe();
```

---

## 11. RAG Pipeline (Qdrant)

### Collection Naming

Each organization gets a dedicated Qdrant collection:

```
{collection_prefix}{organization_id}
// e.g., org_550e8400-e29b-41d4-a716-446655440000
```

### Vector Search Flow

```
1. Embed user query via OpenAI embeddings
2. Search Qdrant collection with org-scoped filters
3. Filter by vault_id or attached file IDs
4. Return top 8 chunks with payload (content, file_name, page_number, etc.)
```

### Fallback Chain

If Qdrant search fails or returns no results:

```
Qdrant vector search
  ↓ (no results)
file_chunks table (direct SQL read)
  ↓ (no chunks)
files.extracted_text (raw text, limited to 50KB per file)
```

### Collection Auto-Creation

The `document-processor` auto-creates Qdrant collections on first file upload:

```typescript
async function ensureQdrantCollection(url, apiKey, name, vectorSize) {
  // Check if collection exists (GET /collections/{name})
  // If 404 → create with cosine distance
}
```

---

## 12. Citation System

### Citation Types

1. **Vault Citations**: Extracted from `[filename · p.X]` patterns in AI response
2. **Search Citations**: From Perplexity `citations[]` URL mapping
3. **Tool Citations**: From CourtListener, EDGAR, EUR-Lex results

### Citation Format

- Inline: `[1]`, `[2]`, `[3]` — sequential integers only
- No `[Web]` or non-numeric markers
- Every factual claim must cite its source number

### Citation Extraction (Post-Processing)

```typescript
function extractCitations(content: string, allContext: string): Citation[] {
  // Scans response for [N] patterns
  // Maps to vault file names from context
  // Merges with tool citations (URLs from Perplexity, CourtListener, etc.)
}
```

### Year-Bracket Guard

Prevents `[2019]`, `[2024]` year references from being treated as citations:

```typescript
// Skip patterns like [2019] UKSC 32 — these are legal year citations
if (/^\d{4}$/.test(bracketContent)) continue;
```

### Citation Popover (UI)

`CitationPopover.tsx` renders clickable citation chips:
- **URL citations**: Link to external source
- **Vault citations**: Show excerpt from document
- **Reference-only**: Show source name without link

---

## 13. Streaming SSE Protocol

The `llm-router` streams responses as **Server-Sent Events (SSE)**.

### Event Types

| Event | Payload | Purpose |
|-------|---------|---------|
| `step` | `{ step: { name, status, detail } }` | Agent step progress |
| `thinking` | `{ content: string }` | Inner monologue narration |
| `reasoning` | `{ content: string }` | LLM `<think>` block content |
| `token` | `{ content: string }` | Final answer tokens |
| `plan` | `{ steps: string[] }` | Initial execution plan |
| `plan_update` | `{ steps: string[], reason: string }` | Plan revision during ReAct |
| `intent` | `{ data: IntentData }` | Task classification result |
| `sources` | `{ urls: string[], domains: string[] }` | Search sources found |
| `file_refs` | `{ files: FileRef[] }` | Document references from vault |
| `contradiction` | `{ data: { claim, sourceA, sourceB } }` | Source contradictions |
| `verify_start` / `verify_end` | `{ claim, verified?, source? }` | Self-verification events |
| `escalation` | `{ data: { from, to, reason } }` | Model escalation notification |
| `inline_data` | `{ data: { headers, rows } }` | Structured data tables |
| `self_check` | `{ status: string }` | Self-check result |
| `progress` | `{ current, total }` | Multi-file progress |
| `final_answer_start` | `{}` | Marker before final synthesis |
| `done` | `{ citations, model, followUps }` | Stream complete |
| `error` | `{ error: string }` | Error message |

### Client-Side Handling

`useStreamChat.ts` processes the SSE stream:
- Maintains live accumulators for steps, plan, thinking, sources, file refs, etc.
- On `done`: freezes all metadata into the assistant message for persistence
- Supports abort via `AbortController`

### SSE Format

```
data: {"type": "step", "step": {"name": "Analyzing your query", "status": "done"}}\n\n
data: {"type": "token", "content": "Based on "}\n\n
data: {"type": "token", "content": "the analysis..."}\n\n
data: [DONE]\n\n
```

---

## 14. Workflow System

### Configuration

Workflows are defined in the Agent Config (`api_integrations.config.workflows`):

```typescript
interface WorkflowConfig {
  id: string;
  title: string;        // "Draft a client alert"
  description: string;  // Shown on home page
  type: string;         // Category label
  steps: number;        // Expected step count
  icon: string;         // Lucide icon name (FileText, Clock, etc.)
  systemPrompt: string; // Custom system prompt prepended to base prompt
}
```

### Execution Flow

1. User clicks workflow on Home page → navigates to Chat with `workflowTag` state
2. Chat sends `workflowSystemPrompt` in request body
3. `llm-router` prepends workflow prompt to the base system prompt:
   ```typescript
   if (workflowSystemPrompt) finalSystemPrompt = workflowSystemPrompt + "\n\n" + finalSystemPrompt;
   ```

### Admin Management

Superadmins configure workflows in Admin → Agentic AI → Workflows tab:
- Add/remove workflow templates
- Set custom system prompts, icons, step counts
- Changes are stored in `api_integrations.config.workflows`

---

## 15. Review Tables

### Purpose

Structured data extraction from multiple legal documents into a spreadsheet-like format.

### Output Format

```markdown
<!-- SHEET: Title -->
```json
{
  "columns": [
    { "name": "Col", "type": "free_response", "query": "extraction instruction" }
  ],
  "rows": [
    { "fileName": "file.pdf", "status": "completed", "values": { "Col": "extracted value" } }
  ]
}
```

### Column Types

- `free_response` — open text
- `date` — date values
- `classification` — categorical values
- `verbatim` — exact quotes from document
- `number` — numeric values

### Grounding Rules (Mandatory)

1. **NOT FOUND**: If no verbatim quote exists → `"NOT FOUND IN DOCUMENT"`
2. **Governing Law**: Only from explicit clause, never inferred from addresses/currencies
3. **Document Type Awareness**: LP side letters don't have liability caps or auto-renewal
4. **Payment Term Precision**: Extract each sub-value separately (management fee, carried interest, etc.)
5. **Per-Document Independence**: Each document analyzed in isolation
6. **Self-Verification**: Governing law extraction must include verbatim verification field

### Column Fill (Non-Streaming)

Individual column values can be filled via a dedicated `useCase = "column_fill"` request that returns JSON directly (not streaming):

```typescript
if (useCase === "column_fill" && columnMeta) {
  // Direct AI extraction → returns { values: { filename: value } }
}
```

### Frontend Components

- `SheetEditor.tsx` — Renders the extracted data as an editable spreadsheet
- `Review.tsx` — Full review table management page

---

## 16. Red Flag Analysis

### Purpose

Automated clause-level risk analysis of legal documents.

### Output Format

The LLM outputs a `<!-- REDFLAGS: [title] -->` block containing JSON:

```json
{
  "flags": [
    {
      "clause_text": "verbatim quote from document",
      "risk_level": "CRITICAL",
      "category": "liability",
      "reason": "Creates unlimited liability exposure",
      "suggested_edit": "Rewritten clause text"
    }
  ],
  "summary": {
    "total": 5, "critical": 1, "high": 2, "medium": 1, "low": 1,
    "risk_score": 7
  }
}
```

### Risk Levels

| Level | Meaning |
|-------|---------|
| CRITICAL | Must fix before signing |
| HIGH | Strongly recommended to fix |
| MEDIUM | Worth negotiating |
| LOW | Minor issue, note only |

### Editor Integration

- "Open in Editor" button on red flag messages opens `RedlineView.tsx`
- Resolution order for file targeting:
  1. `redFlagTarget.id` from assistant metadata
  2. Strict normalized title match
  3. Attached file IDs from conversation context
  4. Fallback to `frozenFileRefs`

### Hallucination Guard

- `clause_text` must be verbatim from the document
- Jurisdiction is only flagged when clearly mismatched with parties
- `risk_score` is holistic (0-10), not a sum of flags

---

## 17. Conversation Persistence & UI Hydration

### Message Metadata

Every assistant message stores frozen UI state in the `metadata` JSONB column:

```typescript
{
  frozenSteps: AgentStep[],        // Step tracker state
  frozenPlan: string[],            // Execution plan
  frozenThinkingText: string,      // Inner monologue
  frozenSearchSources: SearchSource,// URLs and domains
  frozenFileRefs: FileRef[],       // Document references
  frozenInlineData: InlineDataTable[],
  frozenContradictions: Contradiction[],
  frozenVerifications: Verification[],
  frozenEscalations: Escalation[],
  frozenIntent: IntentData,
  followUps: string[],             // Follow-up suggestions
  redFlagTarget: { id, name },     // For editor linking
}
```

### User Message Metadata

Persisted in Phase 2.5 (early insert):

```typescript
{
  vaultId: string,
  vaultName: string,
  promptMode: string,
  sources: string[],
  deepResearch: boolean,
  attachedFileIds: string[],
  attachedFileNames: string[],
  workflowTitle: string,
}
```

### UI Hydration on Reload

1. `loadConversation()` fetches all messages from DB
2. For user messages: reconstruct `attachments` from metadata (vault, mode, files)
3. For assistant messages: restore frozen steps, plan, sources, file refs
4. Prompt chips (mode, vault, upload filename) restored from latest user message metadata
5. localStorage (`chat_state_${convId}`) used as fallback for in-progress input state

### localStorage State

```typescript
const state = {
  input,                          // Current input text
  deepResearch,                   // Deep research toggle
  activeSources,                  // Selected sources
  promptMode,                     // Current mode
  selectedVault,                  // Selected vault
  workflowTag,                    // Active workflow
  replyContext,                   // Reply-to context
  conversationAttachedFileIds,    // Attached file IDs
  conversationAttachedFileNames,  // Attached file names
};
localStorage.setItem(`chat_state_${convId}`, JSON.stringify(state));
```

---

## 18. Admin Panel

### Access Control

The admin panel (`/admin`) is restricted to **superadmin** role only. Organization admins (`admin` role) do NOT have access to the admin panel.

### Tabs

| Tab | Component | Purpose |
|-----|-----------|---------|
| LLM Providers | `LlmTab` | Configure AI model providers (OpenAI, Anthropic, Google, etc.) |
| Search & Research | `SearchTab` | Perplexity API key, CourtListener config |
| Legal APIs | `LegalApisTab` | CourtListener, EDGAR user-agent, EUR-Lex settings |
| Storage (R2) | `StorageTab` | Cloudflare R2 credentials, bucket config, connection test |
| Knowledge Base | `KnowledgeTab` | Organization knowledge entries for prompt injection |
| Agentic AI | `AgentTab` | Agent behavior, workflows, prompts, infrastructure (OCR, Qdrant, OpenAI), rate limits |
| Feedback | `FeedbackTab` | View user thumbs-up/down feedback on messages |
| Users | `UsersTab` | View all users, toggle roles (member/admin/superadmin) |

### User Management

Superadmins can:
- View all users across all organizations
- Toggle user roles between `member`, `admin`, and `superadmin`
- Managed via direct profile updates (superadmin RLS allows `ALL` on profiles)

---

## 19. API Key Security

### Client-Side Encryption

API keys (LLM, search, etc.) are encrypted before storage:

1. Frontend calls `encrypt-api-key` edge function with raw API key
2. Edge function verifies caller is admin/superadmin
3. Derives AES-256-GCM key using PBKDF2:
   ```
   Secret: SUPABASE_SERVICE_ROLE_KEY
   Salt: "lawkit-api-key-enc"
   Iterations: 100,000
   Hash: SHA-256
   ```
4. Encrypts with random 12-byte IV
5. Returns `{ api_key_encrypted: hex, api_key_iv: hex }`
6. Stored in `llm_configs` or `api_integrations` tables

### Server-Side Decryption

The `llm-router` decrypts API keys at runtime using the same PBKDF2-derived key:

```typescript
async function decryptApiKey(encryptedHex: string, ivHex: string): Promise<string> {
  // Reverse the encryption: PBKDF2 → AES-GCM decrypt
}
```

### Security Properties

- Raw API keys never stored in database
- Only edge functions (server-side) can decrypt
- Service role key serves as master encryption secret
- Client never sees decrypted keys after initial entry

---

## 20. UI Architecture

### Layout

```
┌──────────────────────────────────────────┐
│  NavigationSidebar  │  Main Content Area  │
│  (collapsible)      │  (AppLayout child)  │
│                     │                     │
│  - LK logo          │  Chat / Vault /     │
│  - New Chat btn     │  Review / Settings  │
│  - Assistant tree   │  / Admin / etc.     │
│  - Vault tree       │                     │
│  - Workflows        │                     │
│  - History          │                     │
│  - Settings         │                     │
│  - Admin (superadmin)│                    │
│  - Sign out         │                     │
└──────────────────────────────────────────┘
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `AppLayout` | Shell with sidebar + main content area |
| `NavigationSidebar` | Collapsible nav with vaults, chats, command palette |
| `ChatInput` | Multi-line input with mode selector, vault picker, source chips, file upload |
| `MessageBubble` | Renders user/assistant messages with citations, steps, actions |
| `StepTracker` | Animated agent step visualization during streaming |
| `SourcesPanel` | Slide-out panel showing search sources and URLs |
| `DocumentEditor` | Rich text document viewer/editor |
| `RedlineView` | Red flag analysis viewer with clause highlighting |
| `SheetEditor` | Spreadsheet-style review table editor |
| `CitationPopover` | Clickable citation chips with source details |
| `FollowUpSuggestions` | Clickable follow-up question chips |

### Command Palette

`Cmd+K` / `Ctrl+K` opens a search dialog across:
- Conversations (by title)
- Vaults (by name)
- Files (by name)

### Protected Routes

`ProtectedRoute.tsx` wraps authenticated pages:
```tsx
<Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
```

### Pages

| Route | Page | Access |
|-------|------|--------|
| `/` | Home | Authenticated |
| `/chat` | Chat (with `?id=`) | Authenticated |
| `/vault` | Vault management | Authenticated |
| `/review` | Review tables | Authenticated |
| `/documents` | Document editor | Authenticated |
| `/workflows` | Workflow gallery | Authenticated |
| `/history` | Conversation history | Authenticated |
| `/settings` | User/org settings | Authenticated |
| `/admin` | Admin panel | Superadmin only |
| `/auth` | Login/signup | Public |
| `/onboarding` | Org setup | Authenticated (no org) |
| `/shared/:token` | Public shared chat | Public |

---

## 21. Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|------------|
| `organizations` | Tenant/workspace | name, slug, plan, max_users, max_storage_gb |
| `profiles` | User profiles | email, full_name, role, organization_id |
| `vaults` | Document collections | name, organization_id, created_by |
| `files` | File records | name, storage_path, vault_id, status, extracted_text, chunk_count |
| `file_chunks` | Text chunks for RAG | file_id, content, chunk_index, qdrant_point_id |
| `conversations` | Chat conversations | title, organization_id, vault_id, share_token |
| `messages` | Chat messages | conversation_id, role, content, metadata, citations, sources |

### Configuration Tables

| Table | Purpose |
|-------|---------|
| `llm_configs` | LLM provider configurations (encrypted API keys) |
| `api_integrations` | External service configs (Perplexity, R2, agent_config) |
| `knowledge_entries` | Org knowledge base entries |

### Feature Tables

| Table | Purpose |
|-------|---------|
| `review_tables` | Review table definitions |
| `review_columns` | Column definitions with extraction queries |
| `review_rows` | Extracted data rows per file |
| `red_flag_analyses` | Red flag analysis results |
| `documents` | Rich text documents (editor) |
| `document_versions` | Document version history |
| `agent_memory` | Per-user agent memory entries |
| `message_feedback` | Thumbs up/down feedback |
| `audit_logs` | System audit trail |

### Sharing Tables

| Table | Purpose |
|-------|---------|
| `conversation_shares` | Conversation sharing by email |
| `vault_shares` | Vault sharing by email |

### RLS Policy Summary

All tables use RLS with these patterns:
- **SELECT**: `organization_id = get_user_org_id()` (+ superadmin override)
- **INSERT**: `organization_id = get_user_org_id()` (+ creator checks)
- **UPDATE**: `organization_id = get_user_org_id()` (+ ownership checks)
- **DELETE**: `organization_id = get_user_org_id()` (+ admin/ownership checks)

Sharing tables use `is_conversation_shared_with_user()` SECURITY DEFINER to prevent RLS recursion.

---

## 22. Edge Functions

All edge functions are in `supabase/functions/` and auto-deployed.

### `llm-router`

- **Purpose**: Central AI orchestrator
- **Auth**: Bearer token (Supabase JWT)
- **Input**: ChatRequest JSON
- **Output**: SSE stream
- **Services used**: LLM providers (via gateway), Perplexity, CourtListener, EDGAR, EUR-Lex, Qdrant, Supabase DB
- **Size**: ~2,400 lines

### `document-processor`

- **Purpose**: File ingestion pipeline
- **Auth**: Service role (called server-to-server)
- **Input**: `{ fileId: string }`
- **Output**: JSON result
- **Services used**: R2 (download), Mistral OCR, OpenAI embeddings, Qdrant, Supabase DB

### `r2-upload`

- **Purpose**: Upload files to Cloudflare R2
- **Auth**: Bearer token (validates user, resolves org)
- **Input**: Multipart form data (file + r2Key) or JSON (test_connection)
- **Output**: JSON with r2_key

### `r2-download`

- **Purpose**: Generate download URLs for R2 files
- **Auth**: Bearer token (validates user, checks file org ownership)
- **Input**: `{ r2Key: string }`
- **Output**: JSON with URL (public or pre-signed)

### `encrypt-api-key`

- **Purpose**: Encrypt API keys for secure storage
- **Auth**: Bearer token (admin/superadmin only)
- **Input**: `{ api_key: string }`
- **Output**: `{ api_key_encrypted: hex, api_key_iv: hex }`

---

## 23. Environment & Deployment

### Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Auto-populated | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Auto-populated | Supabase anon key |
| `VITE_SUPABASE_PROJECT_ID` | Auto-populated | Project ID for edge function URLs |

### Edge Function Secrets

| Secret | Purpose |
|--------|---------|
| `SUPABASE_URL` | Supabase URL (server-side) |
| `SUPABASE_ANON_KEY` | Anon key for user-context queries |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for admin operations + encryption |
| `LOVABLE_API_KEY` | Lovable AI Gateway access |

### Deployment

- **Frontend**: Deployed via Lovable (Vite build → CDN)
- **Edge Functions**: Auto-deployed on file save in `supabase/functions/`
- **Database**: Managed by Supabase (migrations in `supabase/migrations/`)

---

## Appendix: Key Architectural Decisions

1. **R2 over Supabase Storage**: Cloudflare R2 provides S3-compatible storage without egress fees, better for large legal documents
2. **Qdrant over pgvector**: Dedicated vector DB provides better performance for RAG at scale
3. **SSE over WebSockets**: Simpler one-way streaming, compatible with edge function constraints
4. **Role on profiles (not separate table)**: Simplified by RLS anti-escalation policy preventing self-modification. The `has_role` / `is_superadmin` functions use SECURITY DEFINER to avoid recursion
5. **Agent Config in api_integrations**: All agent settings (OCR, Qdrant, OpenAI, workflows, prompts) stored as single JSONB blob in `api_integrations` with `provider = "agent_config"` — enables per-org configuration without schema migrations
6. **Early user message persistence**: User messages are inserted before the tool loop (Phase 2.5) to ensure metadata survives even on early exits (e.g., "Document Not Ready")
7. **Frozen metadata pattern**: Assistant message metadata stores the complete UI state at completion time, enabling full reconstruction on page reload without re-running the agent
