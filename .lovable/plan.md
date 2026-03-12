

# Plan: Fix Attached File Scoping + Agent Memory Table

## Problem 1: AI ignores attached files, searches entire vault

**Root cause chain:**
1. Files are uploaded and `attachedFileIds` are passed correctly to `llm-router`
2. `toolReadFiles` reads the specific files correctly (line 218-219)
3. **BUT**: After `read_files` returns, the **inner monologue** at line 898 evaluates the result. It sees `context_preview` showing "Document Contents" which looks generic
4. The monologue decides `next_action: "TOOL"` with `next_tool: "vault_search"` — this searches the **entire Uploads vault** (all files ever uploaded), not just the attached ones
5. `toolVaultSearch` (line 849) receives `attachedFileIds` but the Qdrant vector search may return results from OTHER files in the same vault
6. The monologue then sees multiple files and says "Please specify which document"

**Two-part fix in `llm-router/index.ts`:**

### Fix A: Prevent monologue from overriding to vault_search when attachedFileIds exist
After the inner monologue decides next action (line 956-977), add a guard: if `attachedFileIds?.length` is set, the monologue MUST NOT switch to `vault_search`. If it tries to, force `nextTool = ""` (finish). The attached files ARE the scope.

### Fix B: Tell the inner monologue about explicit attachments
When calling `innerMonologue` (line 898), include `has_explicit_attachments: true` and the file names in the user content so the monologue knows these are the user's explicitly attached files and doesn't ask for clarification.

### Fix C: Tell the final synthesis about explicit attachments
In the system prompt construction (line 1129-1133), when `attachedFileIds?.length`, add a line: `"The user explicitly attached these files for analysis. Analyze ALL attached files directly. Do NOT ask which file to analyze."`

## Problem 2: Agent Memory table (Task 7 from last message)

Create `agent_memory` table with RLS and update `llm-router` to:
- Load last 10 memory entries at the start of each request
- Save a 2-sentence summary after each conversation response

### Migration SQL
```sql
CREATE TABLE public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
-- RLS policies
```

### llm-router changes
- After loading knowledge/vault info (Phase 1), also load last 10 agent_memory entries
- After saving the assistant message (Phase 6), generate a memory summary and save it

## File changes

| File | Changes |
|------|---------|
| `supabase/functions/llm-router/index.ts` | Guard monologue from vault_search when attachedFileIds exist; inject attachment context into monologue + synthesis; load/save agent memory |
| `supabase/migrations/new.sql` | Create `agent_memory` table with RLS |

