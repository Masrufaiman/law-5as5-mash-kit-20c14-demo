

# Phase 2: Homepage, Perfected UI, Enhanced Admin Panel, R2-Only Storage

## What We're Building

Three major workstreams: (1) a Harvey-style homepage with prompt box, (2) enhanced Admin panel with deeper configs for Knowledge Base, R2, and Agentic AI, and (3) routing changes so `/` is the Assistant homepage (not Vault).

---

## 1. Homepage — Harvey-Style Prompt Box (New Route: `/`)

Currently `/` renders the Vault page. Change it to a dedicated homepage matching the Harvey screenshots (image-16, image-17).

**New file: `src/pages/Home.tsx`**

Layout (centered, clean):
- "LawKit" heading (Playfair Display, centered)
- Two action links above input: "Choose vault" and "Set client matter"
- Large multi-line textarea: "Ask LawKit anything..."
- Bottom toolbar: `+ Files and sources`, `Prompts`, `Customize`, `Improve`, `Deep research` toggle, `Ask LawKit` button (dark bg)
- Integration chips row below: pills for each active `api_integrations` (iManage, LexisNexis, Web search, EDGAR, etc.) with `+` icon
- Context chips row: jurisdiction flags, org name, active vault name — all removable
- "Recommended workflows" section at bottom: 4 cards (Draft a client alert, Generate post-closing timeline, Extract chronology, Extract terms from stock purchase) with type badge + step count

**Files and Sources dropdown** (image-18 reference): Popover menu with sections:
- Upload files (triggers file picker)
- Add from vault (sub-menu listing vaults)
- Add from knowledge base (sub-menu listing KB entries)
- Sources section: LexisNexis, Web search, EDGAR, jurisdiction flags

**Attached files display** (image-19, 20): Selected files appear as chips above the textarea (e.g., "Complaint.PDF", "Web search" badge).

**Routing change in `App.tsx`:**
- `/` → `Home.tsx` (new homepage)
- `/vault` → `Vault.tsx` (move vault to its own route)
- Update `NavigationSidebar` so "Vault" links to `/vault`, "Assistant" links to `/`

---

## 2. Navigation Sidebar — Search Icon

Add a search icon button to the right of the logo in the sidebar header area. Clicking opens a command palette (cmdk) for global search across vaults, files, conversations.

**Changes to `NavigationSidebar.tsx`:**
- Add `Search` icon next to the LK logo square
- Wire to a `CommandDialog` (already have cmdk installed)

---

## 3. Enhanced Admin Panel — Knowledge Base with File Upload

The Knowledge Base tab needs to become a proper training/data input system, not just text entries.

**Redesign `KnowledgeTab.tsx`:**
- Two sub-sections: "Instructions" (text entries, existing) and "Training Documents" (file uploads)
- Training Documents: upload legal PDFs, case law, firm policies — stored in R2
- Each document: title, category (Legal Precedents, Firm Policies, Jurisdiction Rules, Case Law, Templates), file upload area, description, `applies_to` multi-select (chat, red_flags, tables, drafting)
- Active/inactive toggle per entry
- File upload uses the same R2 pipeline (not Supabase Storage)
- Display uploaded file name, size, status badge
- Categories from the build guide: Instruction, Example (few-shot), Rule, Persona, API Config

---

## 4. Enhanced Admin Panel — R2 Storage Tab

Current `StorageTab.tsx` is basic. Expand it:
- Add R2 endpoint URL field
- Add "Region" selector
- Add "Test Connection" button that calls an edge function to verify R2 connectivity
- Show current usage stats placeholder (file count, total size from `files` table)
- Add a note: "All files in LawKit are stored exclusively in Cloudflare R2"

---

## 5. Enhanced Admin Panel — Agentic AI Tab

Current `AgentTab.tsx` is minimal. Expand significantly:

**New sections:**
- **Default Behavior**: jurisdiction, citation style, auto-research (existing)
- **Tool Configuration**: Per-tool settings, not just checkboxes
  - Web Search: provider (Tavily/Perplexity), API key field, cache TTL
  - Deep Research: model selection, max iterations, enable/disable
  - Document Analysis: chunk size, overlap, embedding model
  - Red Flag Detection: severity threshold, categories to scan
  - Contract Drafting: template selection, jurisdiction defaults
  - Citation Lookup: preferred databases, format style
- **Prompt Templates**: Editable system prompts per use case (chat, red_flags, tables, drafting)
- **Rate Limits**: Per-org AI call limits, per-user daily limits
- **Tavily API** config section: API key, search depth, max results
- All stored in `api_integrations` with provider variants

---

## 6. R2-Only File Storage

Currently `Vault.tsx` uploads to Supabase Storage. Change the upload flow:
- Remove all Supabase Storage uploads
- File upload goes through an edge function `upload-to-r2` that:
  1. Receives the file
  2. Uploads to R2 using the configured credentials from `api_integrations`
  3. Returns the R2 key
  4. Creates the `files` DB record with `r2_key` and `r2_bucket`
- File downloads: edge function generates signed R2 URLs
- Update `files` table usage: use `r2_key` instead of `storage_path`

**However**, since R2 credentials are configured per-org in the admin panel and edge functions need those credentials, the edge function will:
1. Read R2 config from `api_integrations` (using service role)
2. Use `@aws-sdk/client-s3` compatible fetch to upload

**New edge function: `supabase/functions/r2-upload/index.ts`**
**New edge function: `supabase/functions/r2-download/index.ts`**

---

## 7. Design Polish — Consistent Harvey Aesthetic

Apply the same vault-quality design to all pages:
- **Chat page**: Remove conversation sidebar, use the homepage prompt box pattern. Conversations accessed via History page.
- **Review page**: Match vault grid style with colored header strips on table cards
- **Documents page**: Same card grid pattern
- **Settings page**: Clean card-based layout matching admin panel style

---

## Summary of File Changes

| File | Action |
|------|--------|
| `src/pages/Home.tsx` | **New** — Harvey-style homepage with prompt box |
| `src/App.tsx` | Route changes: `/` → Home, `/vault` → Vault |
| `src/components/NavigationSidebar.tsx` | Add search icon, update vault route |
| `src/components/admin/KnowledgeTab.tsx` | Expand with file upload, categories, applies_to |
| `src/components/admin/StorageTab.tsx` | Add test connection, region, usage stats |
| `src/components/admin/AgentTab.tsx` | Expand with tool configs, prompt templates, rate limits, Tavily |
| `src/pages/Vault.tsx` | Change upload to R2 edge function |
| `src/pages/Chat.tsx` | Simplify, use homepage prompt pattern |
| `src/pages/Review.tsx` | Design polish |
| `src/pages/Documents.tsx` | Design polish |
| `supabase/functions/r2-upload/index.ts` | **New** — R2 file upload |
| `supabase/functions/r2-download/index.ts` | **New** — R2 signed URL generation |
| `src/components/chat/ChatInput.tsx` | Enhanced with Files/Sources popover, Deep research toggle, integration chips |

No new DB migrations needed — existing tables support all features.

