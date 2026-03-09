

# Phase 4: Chat UI Perfection, Working AI, Knowledge Base Sources, Homepage Tags

## Issues to Fix

1. **"AI service unavailable" error**: The `llm-router` edge function uses `getClaims()` which doesn't exist in Supabase JS. Replace with `getUser()` to verify the token.
2. **"Ask Cloudflare R2" chip in chat**: Remove integration chips that show internal storage providers. R2 is infrastructure, not a user-facing source.
3. **Chat UI is "noob"**: Messages have colored backgrounds (user=dark bg, assistant=bordered card). Harvey style is clean — both sides left-aligned, no background bubbles, just clean prose with subtle separators.

---

## 1. Fix LLM Router Edge Function

**File: `supabase/functions/llm-router/index.ts`**

- Replace `getClaims(token)` with `getUser()` which uses the auth header automatically
- This fixes the "AI service unavailable" error since the current code crashes on auth

---

## 2. Harvey-Style Chat UI (No Backgrounds, Left-Aligned)

**Rewrite `MessageBubble.tsx`**:
- Both user and assistant messages left-aligned
- No background color on either — transparent/no-bg
- User: small avatar circle + "You" label, plain text content
- Assistant: "LK" avatar + "LawKit AI" label, markdown prose with no card border
- Streaming cursor as a blinking bar
- Citations inline as superscript popovers
- ResponseActions always visible (not hover-only)

**Update `Chat.tsx`**:
- Remove border-t on input area, use a clean floating input style
- Remove "Ask Cloudflare R2" — filter out `cloudflare_r2` and `agent_config` and `knowledge_document` providers from integration chips
- Step tracker positioned inline between user message and assistant response
- Sources panel styling refinement

---

## 3. Homepage Prompt Box — Tags Inside Input

**Update `Home.tsx`**:
- Move vault name, web search, deep research tags INSIDE the prompt box (above the textarea, as chips)
- When user selects a vault or toggles web search, a tag chip appears inside the input container
- Remove "Ask Cloudflare R2" from integration chips (filter by provider)
- "Sources" in the Files & Sources popover should show knowledge base entries from `knowledge_entries` table (not hardcoded "LexisNexis", "EDGAR" etc.)
- Load knowledge base entries and display them as selectable sources
- "Improve" button: When clicked, rewrites the current prompt using AI (call llm-router with a "rewrite this prompt to be clearer" instruction)
- "Prompts" button: Show a popover with saved prompt templates from agent_config

---

## 4. Knowledge Base as Source Provider

**Update `KnowledgeTab.tsx`**:
- Knowledge base entries become "sources" that users can select in the prompt box
- Each KB entry can have sub-sources (uploaded docs, API connections like EUR-Lex, EDGAR, CourtListener, UK Legislation, WorldLII)
- Add a "Sources" sub-section under each KB entry for API-based sources with provider selector and API key
- Remove "Citation Lookup" from tools in AgentTab
- The KB sources flow: Admin creates KB → adds name/desc → uploads docs OR connects APIs → chunks are created → user selects KB as source in prompt → AI uses those chunks

**Supported API Sources** (configurable per KB entry):
- EUR-Lex API
- UK Legislation API
- WorldLII
- EDGAR (SEC)
- CourtListener

These are just API connection configs stored as part of the KB entry's config JSON. The llm-router will call these APIs when the user selects them as sources.

---

## 5. Filter Internal Providers from UI

Across all pages, filter out these providers from user-facing integration lists:
- `cloudflare_r2`
- `agent_config`
- `knowledge_document`

Only show actual external integrations (LexisNexis, iManage, etc.) and knowledge base entries as sources.

---

## Summary of File Changes

| File | Change |
|------|--------|
| `supabase/functions/llm-router/index.ts` | Fix auth (getClaims → getUser), redeploy |
| `src/components/chat/MessageBubble.tsx` | Harvey-style: no bg, left-aligned, clean prose |
| `src/pages/Chat.tsx` | Filter internal providers, clean input area, inline steps |
| `src/pages/Home.tsx` | Tags inside prompt box, load KB as sources, working Improve/Prompts buttons |
| `src/components/chat/ChatInput.tsx` | Filter internal providers from chips |
| `src/components/admin/KnowledgeTab.tsx` | Add API source configs per KB entry |
| `src/components/admin/AgentTab.tsx` | Remove "Citation Lookup" from tools |

