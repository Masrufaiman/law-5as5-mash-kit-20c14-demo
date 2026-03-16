

# Plan: Technical Documentation + Admin Panel Superadmin Restriction

## 1. Create Technical Documentation (`TECHNICAL.md`)

A comprehensive markdown file documenting the entire LawKit AI system architecture, covering:

- **System Overview**: Multi-tenant legal AI platform with Supabase + React + Vite + Tailwind
- **Authentication & Authorization**: Supabase Auth, roles (member/admin/superadmin), RLS policies, `handle_new_user` trigger, `promote_org_creator` function
- **Multi-Tenancy**: Organization isolation via `get_user_org_id()` SECURITY DEFINER function, RLS on all tables
- **AI Agent Architecture**: The `llm-router` edge function — request classification (6 types), intent analysis via tool calling, ReAct execution loop (up to 20 iterations), inner monologue, self-verification, agent memory
- **Prompt Modes**: Chat/Research, Drafting, Red Flag Detection, Review Table — each with specialized system prompts
- **Search & Research Pipeline**: Multi-query decomposition, Perplexity tier mapping (sonar/sonar-pro/sonar-deep-research), CourtListener, EDGAR, EUR-Lex tool implementations, jurisdiction prefix routing, domain filtering
- **Deep Research**: `sonar-deep-research` with `reasoningEffort: high`, expanded query bundles
- **Document Processing Pipeline**: `document-processor` edge function — R2 download, text extraction (PDF via Mistral OCR, DOCX via ZIP/XML parsing, plain text), chunking, OpenAI embeddings, Qdrant vector upsert
- **Storage Architecture**: Cloudflare R2 via `r2-upload`/`r2-download` edge functions with AWS4-HMAC-SHA256 signed requests — no Supabase Storage for files
- **Vault System**: Organization-scoped vaults, file management, sharing via `vault_shares`
- **RAG Pipeline**: Qdrant vector search with org-scoped collections, fallback to direct `file_chunks` read, then `extracted_text`
- **Citation System**: Extraction from vault context (`[n]` notation), Perplexity URL mapping, year-bracket guard, citation popover with URL/reference-only handling
- **Streaming SSE Protocol**: Event types (step, thinking, token, reasoning, plan, intent, sources, file_refs, contradiction, verify, escalation, inline_data, self_check, progress, done, error)
- **Workflow System**: Admin-configurable workflow templates stored in `agent_config`, custom system prompts, icon mapping
- **Review Tables**: Structured data extraction with `<!-- SHEET: -->` format, grounding rules, per-document independence
- **Red Flag Analysis**: `<!-- REDFLAGS: -->` JSON format, risk scoring, hallucination guard, editor linking via `redFlagTarget` metadata
- **Conversation Persistence**: Message metadata for UI state restoration (frozenSteps, frozenPlan, frozenFileRefs, etc.), user message metadata for prompt chips
- **Admin Panel**: Superadmin-only (after fix), tabs for LLM providers, Search/Perplexity, Legal APIs, Storage (R2), Knowledge Base, Agentic AI config, Feedback
- **API Key Security**: Client-side encryption via `encrypt-api-key` edge function, server-side AES-GCM decryption with PBKDF2-derived key
- **Fast-Path Optimization**: Bypass planner/ReAct for simple conversational messages
- **UI Architecture**: AppLayout with NavigationSidebar, collapsible sidebar, command palette (Cmd+K), realtime vault subscriptions, responsive skeleton loading
- **Database Schema**: All tables with their purposes, foreign keys, and RLS policies summarized
- **Edge Functions**: `llm-router`, `document-processor`, `r2-upload`, `r2-download`, `encrypt-api-key`

## 2. Admin Panel Fix: Superadmin-Only Access

**Current behavior**: Both `admin` and `superadmin` roles can access `/admin`. Org creators are promoted to `admin` via `promote_org_creator`.

**Required behavior**: Only `superadmin` can access `/admin`. Org admins get 0 admin panel access. From admin panel, superadmin can add other admins.

### Changes:

**`src/pages/Admin.tsx`**
- Change access check from `profile?.role === "admin" || profile?.role === "superadmin"` to `profile?.role === "superadmin"` only
- Add a new "Users" tab where superadmin can view all users across orgs and toggle admin roles

**`src/components/NavigationSidebar.tsx`**
- Change sidebar admin link visibility from `profile?.role === "admin" || profile?.role === "superadmin"` to `profile?.role === "superadmin"` only

**New component: `src/components/admin/UsersTab.tsx`**
- Lists all profiles (superadmin can see all via existing RLS policy)
- Shows user email, org, current role
- Toggle button to promote/demote users to admin (via service-role RPC or direct update — superadmin RLS already allows ALL on profiles)

**`src/pages/Admin.tsx`** updated tab list:
- Add Users tab with user management (role toggling)
- Add Organizations tab to view all orgs
- Keep existing tabs (LLM, Search, Legal APIs, Storage, Knowledge, Agent, Feedback)

### Files to create/edit:
- Create: `TECHNICAL.md`
- Create: `src/components/admin/UsersTab.tsx`
- Edit: `src/pages/Admin.tsx`
- Edit: `src/components/NavigationSidebar.tsx`

