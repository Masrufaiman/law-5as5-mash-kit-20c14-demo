

# Phase 3: Agentic AI Chat, Harvey-Perfect UI, Backend Intelligence

## Current State Assessment

The foundation exists: auth, database, sidebar, vault, admin tabs, R2 edge functions. But the app lacks the **soul** — no real AI responses, no streaming, no multi-step agent reasoning, no citations, no document viewer, no track changes. The Chat page is a placeholder. The images show Harvey's sophisticated agentic workflow: step-by-step reasoning with checkmarks, file uploads inline, draft document output blocks with copy/download/expand, citation popovers linking to source documents, and inline AI editing with red strikethrough + green additions.

This plan focuses on making the **chat experience production-real** and bringing all pages to Harvey-level polish.

---

## 1. LLM Router Edge Function (Backend Core)

**New: `supabase/functions/llm-router/index.ts`**

Central AI routing function that:
- Reads `llm_configs` table for the org's active provider (Anthropic/OpenAI/etc.)
- Decrypts API keys server-side
- Injects knowledge base entries from `knowledge_entries` into system prompt
- Supports streaming SSE responses
- Implements the agentic step pattern: vault search, web search (Tavily), deep research (Perplexity)
- Returns structured responses with citations, steps, and sources
- Handles 429/402 rate limit errors gracefully

**Fallback**: If no LLM is configured, uses Lovable AI Gateway (`google/gemini-3-flash-preview`) as default.

**Request format:**
```json
{
  "conversationId": "uuid",
  "message": "user text",
  "vaultId": "optional",
  "deepResearch": false,
  "attachedFileIds": [],
  "sources": ["web_search"]
}
```

**Response**: SSE stream with events for steps, content tokens, citations, and completion.

---

## 2. Chat Page — Full Harvey Rebuild

**Rewrite `src/pages/Chat.tsx`** to match Harvey screenshots (images 25-27, 33-34):

- Remove the conversation sidebar (access via History page instead)
- Conversation header: breadcrumb "Assistant /" + title + edit icon + "WORKFLOW" badge + "+ New thread" / "Share" / "Export" buttons
- **Message rendering with markdown** (install `react-markdown`):
  - AI messages: left-aligned, "H" avatar circle, prose rendering
  - User messages: user avatar, right context
  - File attachment cards: PDF icon + filename + "PDF document · 0.13 MB" (image 25)
  - Draft output blocks: bordered card with "Draft" header + copy/download/expand icons (image 27)
- **Agentic step tracker** (image 26): "Working..." header, checkmark list showing completed/in-progress steps, collapsible "Finished in N steps"
- **Citation system**: superscript numbers `[1]` `[2]` in responses, clicking opens a popover showing source document excerpt with page numbers (image 28, 33)
- **Sources panel**: right sidebar showing "Sources" with file name + clickable page number grid (image 33)
- **Review table inline** (image 34): AI can output structured tables with Area/Current Obligation/Suggested Change columns, with citation numbers per cell
- **Action bar under responses**: Copy, Export, Rewrite buttons + thumbs up/down (image 34)
- **Streaming**: Real SSE token-by-token rendering using the pattern from useful-context
- Input at bottom uses the existing `ChatInput` component

---

## 3. Document Editor — Right Panel with Inline AI

**New: `src/components/editor/DocumentEditor.tsx`**

Based on images 29-30 (Harvey's inline editing):
- Rich text rendering of AI-generated documents
- **Text selection → AI popup**: Select text, a floating toolbar appears with text input + "Cancel" / "Ask LawKit" buttons (image 29)
- **Track changes display** (image 30): Red strikethrough for deletions, new text inserted after. This is the Harvey signature feature.
- Opens in the AppLayout right panel when clicking a citation or document

Since we can't add Tiptap (not in dependencies), use a contentEditable div with custom selection handling for the MVP, or render read-only with the AI edit popup pattern.

---

## 4. Vault Detail — Harvey-Exact Match

**Update `src/components/vault/VaultDetail.tsx`** to match image 32 exactly:

- "Create new query" section with workflow cards: "Start a query from scratch", "Extract Terms from Merger Agreements", "Analyze Change of Control Provisions", "View all workflows →" — each card with description + category dot badge
- "Recent queries" section: table with query name, type badge (Review table / Assist), time ago
- "Project files" table header: `Q Search` | `Create folder` | `Upload files` | `Filters F`
- File table columns exactly: checkbox, File name (with PDF icon), Category (colored dot + label), Type, Last modified, Size, ... menu

**Update `src/components/vault/VaultGrid.tsx`**: Match the vault card style from image 31 — large icon area with gradient bg, file count + query count, "Secured by LawKit Vault" badge

---

## 5. Homepage Refinements

Minor polish to `src/pages/Home.tsx`:
- Match the exact Harvey input bar more closely
- Ensure "Files and sources" popover matches image 18-20 patterns
- Workflow cards should link to actual workflow creation

---

## 6. Streaming Infrastructure

**New: `src/hooks/useStreamChat.ts`**

Custom hook implementing:
- SSE connection to `llm-router` edge function
- Token-by-token message building
- Step progress tracking (step name + status)
- Citation extraction and indexing
- Error handling for 429/402
- AbortController for cancellation
- Saves messages to Supabase `messages` table

---

## 7. Chat Message Components

**New components in `src/components/chat/`:**

- `MessageBubble.tsx` — renders user/assistant messages with markdown, handles file attachments
- `StepTracker.tsx` — "Working..." with animated checkmarks per step (image 26)
- `CitationPopover.tsx` — clickable `[1]` superscripts showing source excerpt + page + "Open in viewer"
- `DraftBlock.tsx` — bordered document preview with "Draft" header + copy/download/expand actions (image 27)
- `FileAttachment.tsx` — file card with icon + name + type + size (image 25)
- `ResponseActions.tsx` — Copy, Export, Rewrite + thumbs up/down bar (image 34)
- `SourcesPanel.tsx` — right sidebar with source files + page number grids (image 33)

---

## 8. Install react-markdown

Add `react-markdown` dependency for rendering AI responses with proper formatting (headers, lists, bold, code blocks, tables).

---

## Summary of File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/llm-router/index.ts` | New | Central AI routing with streaming |
| `src/pages/Chat.tsx` | Rewrite | Full Harvey-style chat with streaming |
| `src/hooks/useStreamChat.ts` | New | SSE streaming hook |
| `src/components/chat/MessageBubble.tsx` | New | Markdown message rendering |
| `src/components/chat/StepTracker.tsx` | New | Agentic step progress |
| `src/components/chat/CitationPopover.tsx` | New | Source citation popovers |
| `src/components/chat/DraftBlock.tsx` | New | Document draft output blocks |
| `src/components/chat/FileAttachment.tsx` | New | Inline file attachment cards |
| `src/components/chat/ResponseActions.tsx` | New | Copy/Export/Rewrite action bar |
| `src/components/chat/SourcesPanel.tsx` | New | Sources right panel |
| `src/components/editor/DocumentEditor.tsx` | New | Inline AI editing with track changes |
| `src/components/vault/VaultDetail.tsx` | Update | Query cards + recent queries + exact table |
| `src/components/vault/VaultGrid.tsx` | Update | Harvey-style vault cards |
| `supabase/config.toml` | Update | Register llm-router function |

Dependencies to add: `react-markdown`

This plan prioritizes making the chat **actually work** with real AI streaming and the Harvey-style agentic UX, while polishing vault and document views to match the reference screenshots.

