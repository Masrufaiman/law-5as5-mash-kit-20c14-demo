

# Phase 1: UI Overhaul + Admin Panel for Agentic AI

## 1. Color System Fix

Replace `#2596be` blue primary with `#0e2526` (dark teal). `#0e2526` converts to approximately `hsl(174, 50%, 10%)`.

**Updated palette:**
- Primary: `#0e2526` → `hsl(174, 50%, 10%)` — dark teal, used for buttons, nav active states, logo bg
- Accent: `#e7fd7e` → `hsl(75, 97%, 74%)` — lime green highlights (keep)
- Secondary/Light BG: `#f8ffde` → `hsl(72, 100%, 93%)` — soft cream (keep)
- Ring/focus: match primary

Dark mode will use a slightly lighter variant of `#0e2526` for visibility.

Files: `src/index.css`

---

## 2. Navigation Sidebar Redesign (Harvey-style)

Current: 64px icon-only sidebar.
Target (from images): Wider sidebar (~220px) with text labels, org name at top, collapsible vault sub-items, bottom section with Help/Settings.

```text
┌──────────────────────┐
│ ■ Org Name ▾         │
│ + Create             │
├──────────────────────┤
│ 💬 Assistant         │
│ 📁 Vault             │
│    ├ Statements (ABM) │
│    ├ Delta Supply     │
│    └ Supply Agreements│
│ 🔄 Workflows         │
│ 📜 History           │
│ 📚 Library           │
│ 📖 Guidance          │
├──────────────────────┤
│ ⚙ Settings           │
│ 🛡 Admin             │
│ ❓ Help              │
└──────────────────────┘
```

Files: `src/components/NavigationSidebar.tsx`, `src/components/AppLayout.tsx`

---

## 3. Vault Page Redesign (Harvey-style)

**Top-level vault view** (image 13):
- Header: "Vault" title + subtitle
- Two action cards: "Create vault" and "Create knowledge base" with icons
- Tabs: "All vaults" / "Your vaults" / "Shared with you"
- Search bar
- Vault grid: cards with colored header strips, vault name, file count, type badge

**Inside-vault view** (image 15):
- Header: vault name, file count + storage size
- Embedded AI prompt bar ("Ask Harvey anything...")
- Quick action chips: "Create a draft document", "Create a review table"
- "Recent queries" section showing past interactions
- "Project files" table with columns: Name, Category, Type, Last modified, Size
- Toolbar: Search, Create folder, Upload files, Filters

Files: `src/pages/Vault.tsx`, new `src/components/vault/VaultGrid.tsx`, `src/components/vault/VaultDetail.tsx`, `src/components/vault/FileTable.tsx`

---

## 4. Chat Input Redesign (Harvey-style)

Current: simple text input + send button.
Target (image 12): Rich input area with:
- Multi-line textarea with placeholder
- Bottom toolbar: Files, Sources, Improve buttons
- Jurisdiction selector dropdown (country flags)
- Integration chips area below (Ask LexisNexis, iManage, etc.)
- Settings/expand icons on the right

For LawKit, adapt as:
- Files button → attach from vault
- Sources button → select knowledge base entries
- Jurisdiction selector → configurable per org
- Integration chips → show configured API integrations from admin panel

Files: `src/pages/Chat.tsx`, new `src/components/chat/ChatInput.tsx`

---

## 5. Admin Panel Expansion — Agentic AI Configs

Current admin panel only manages LLM configs. Expand with tabbed sections:

**Tab 1: LLM Providers** (existing, improved)
- Keep current functionality

**Tab 2: Search & Research APIs**
- Perplexity API config (key, default model: sonar/sonar-pro/sonar-reasoning)
- Web search toggle (enable/disable for chat)
- Deep research toggle + model selection
- Store credentials in `api_integrations` table (already exists)

**Tab 3: Storage (R2/S3)**
- Cloudflare R2 credentials: Account ID, Access Key ID, Secret Access Key, Bucket Name, Public URL
- Store in `api_integrations` with `provider = 'cloudflare_r2'`
- Test connection button

**Tab 4: External Integrations**
- Placeholder for future: LexisNexis, iManage, etc.
- Each integration: name, provider, API key, config JSON, active toggle
- Uses existing `api_integrations` table

**Tab 5: Knowledge Base**
- Manage `knowledge_entries` table
- CRUD for firm-specific AI instructions
- Categories: Legal precedents, Firm policies, Jurisdiction rules

**Tab 6: Agentic AI Settings**
- Agent behavior config (stored as org-level settings in `api_integrations` with `provider = 'agent_config'`):
  - Default jurisdiction
  - Auto-research toggle
  - Citation style (Bluebook, OSCOLA, etc.)
  - Max research depth
  - Allowed tools for agents

No new DB tables needed — `api_integrations` already supports arbitrary providers with JSON config.

Files: `src/pages/Admin.tsx`, new `src/components/admin/LlmTab.tsx`, `src/components/admin/SearchTab.tsx`, `src/components/admin/StorageTab.tsx`, `src/components/admin/IntegrationsTab.tsx`, `src/components/admin/KnowledgeTab.tsx`, `src/components/admin/AgentTab.tsx`

---

## 6. FileCard + File Table Component

Add a proper table view for files inside a vault (image 15 style):
- Columns: Name (with icon), Category (tag), Type, Last modified, Size
- Row hover states, click to preview
- Sortable columns

Files: new `src/components/vault/FileTable.tsx`

---

## Summary of Changes

| Area | Files | Scope |
|------|-------|-------|
| Colors | `src/index.css` | Replace primary HSL values |
| Sidebar | `NavigationSidebar.tsx`, `AppLayout.tsx` | Full redesign to 220px text sidebar |
| Vault | `Vault.tsx` + 3 new components | Two-level view (grid + detail) |
| Chat input | `Chat.tsx` + new `ChatInput.tsx` | Rich toolbar input |
| Admin | `Admin.tsx` + 6 new tab components | 6-tab config panel |
| File table | New `FileTable.tsx` | Sortable table view |

No database migrations needed — existing `api_integrations` and `knowledge_entries` tables cover all new admin configs.

