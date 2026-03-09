

# Phase 5: Perplexity-Powered Legal AI, Knowledge Base Overhaul, Prompt Box Perfection

## Current Issues

1. **AI not responding**: The `llm-router` works but the user's Perplexity API key is stored base64-encoded in `api_integrations`. The edge function never reads or uses it — it only uses Lovable AI Gateway. Need to integrate Perplexity for search/deep research.
2. **"Add Entry" not working in KB**: The `resetForm()` call in the onClick clears `showAdd` immediately after setting it to `true`, so the form never appears.
3. **KB needs Source-first workflow**: Currently it's flat entries. Need: create a Source (name + desc) first, then add instructions and upload docs under it.
4. **Deep research toggle missing from prompt box**: Was removed; needs to come back.
5. **Prompt box textarea bg should match controls bg**: Currently `bg-transparent`, needs `bg-muted/30` or same as the toolbar.
6. **Improve button**: Already works on Home page but not wired in ChatInput.
7. **Prompts button**: Not wired — needs to show saved prompt templates from agent_config.
8. **Integrations tab**: Remove it entirely. Use Perplexity as the sole search/research engine.
9. **Jurisdiction sources in prompt box**: Add 50+ jurisdiction sources as selectable tags that instruct Perplexity where to search.
10. **Perplexity integration in llm-router**: Use Perplexity for web search + deep research, get citations/links back, feed into the AI response.

---

## 1. Fix Knowledge Base — Source-First Workflow

**Rewrite `KnowledgeTab.tsx`**:

- Remove the Instructions/Training Documents tabs split
- New flow: "Create Source" button → enter Name + Description → saves as a `knowledge_entries` row with empty content
- Each Source expands to show:
  - **Instructions**: Add text-based instructions under this source (stored as child knowledge_entries or in the content field as JSON)
  - **Documents**: Upload files under this source (stored via R2, referenced in config JSON)
- Fix the "Add Entry" bug: remove the `resetForm()` call that clears `showAdd`
- Sources appear as selectable items in the prompt box

---

## 2. Remove Integrations Tab from Admin

**Update `Admin.tsx`**:
- Remove the Integrations tab entirely
- Remove import of `IntegrationsTab`
- Keep: LLM Providers, Search & Research (Perplexity), Storage (R2), Knowledge Base, Agentic AI

---

## 3. Jurisdiction Sources in Prompt Box

**Update `Home.tsx`**:

Add a comprehensive list of jurisdiction/legal database sources as selectable chips. These are NOT separate APIs — they are search domain filters passed to Perplexity:

```
EDGAR, CourtListener, EUR-Lex, UK Legislation, Indian Law, US Law, 
Australian Law, Canadian Law, French Law, German Law, Brazilian Law,
Singapore Law, UAE Law, Italian Law, Mexican Law, Swedish Law, 
Arabic Law, Belgian Law, Danish Law, Chilean Law, Finnish Law,
Dutch Law, Portuguese Law, Polish Law, Swiss Law, Hungarian Law,
Austrian Law, Czech Law, Dominican Republic Law, Ecuadorian Law,
Luxembourgish Law, Paraguayan Law, Peruvian Law, WorldLII, 
Casablanca Agreement, Whitford Lane, Web Search
```

These appear in the "Files & sources" popover under a "Jurisdictions & Databases" section. When selected, they appear as chips inside the prompt box and are passed to the llm-router as `sources[]`.

---

## 4. Perplexity-Powered LLM Router

**Rewrite `supabase/functions/llm-router/index.ts`**:

The core change: when `sources` array is provided or `deepResearch` is true, call Perplexity API first to get grounded search results with citations, then feed those results + KB context into Gemini for the final response.

Flow:
1. Auth + get org
2. Load KB entries + vault context (existing)
3. **If sources or webSearch or deepResearch**: Call Perplexity API (`sonar` for search, `sonar-deep-research` for deep research) with the user's query + domain filters from sources
4. Extract Perplexity citations (URLs) and content
5. Inject Perplexity results into system prompt as additional context
6. Load custom system prompts from agent_config if configured
7. Call Gemini (Lovable AI Gateway) with enriched context for the final streaming response
8. Return citations from both Perplexity and vault docs

The Perplexity API key is read from `api_integrations` where `provider = 'perplexity'`. The key is base64-decoded from `api_key_encrypted`.

**Source-to-domain mapping**: When user selects "EDGAR", add `search_domain_filter: ['sec.gov']`. When "EUR-Lex", add `['eur-lex.europa.eu']`. When "CourtListener", add `['courtlistener.com']`. Etc. Perplexity handles all the searching — no separate API integrations needed.

---

## 5. Prompt Box Perfection

**Update `Home.tsx`**:
- Deep research toggle: Add back as a visible switch in the toolbar
- Textarea bg: Change to match `bg-muted/30` (same as controls area)
- **Improve button**: Already works (calls llm-router). Keep as is.
- **Prompts button**: Wire to show a popover with saved prompt templates from agent_config. Load the `prompts` field from the `agent_config` integration and display them as clickable templates that fill the textarea.

**Update `ChatInput.tsx`**:
- Add deep research toggle
- Add improve button (calls llm-router with rewrite instruction)
- Add prompts popover

---

## 6. Clean Up AgentTab

**Update `AgentTab.tsx`**:
- Remove Tavily section entirely
- Remove web search provider selector (it's always Perplexity now)
- Remove web search API key field (configured in Search tab)
- Keep: Behavior, Document Analysis, Red Flag Detection, Prompts, Rate Limits

---

## Summary of File Changes

| File | Action |
|------|--------|
| `src/components/admin/KnowledgeTab.tsx` | Rewrite: Source-first workflow, fix Add Entry bug |
| `src/pages/Admin.tsx` | Remove Integrations tab |
| `src/pages/Home.tsx` | Add jurisdictions, fix textarea bg, wire Prompts button, deep research toggle |
| `src/components/chat/ChatInput.tsx` | Add deep research, improve, prompts to chat input |
| `supabase/functions/llm-router/index.ts` | Integrate Perplexity search + deep research, use custom prompts from agent_config |
| `src/components/admin/AgentTab.tsx` | Remove Tavily, simplify tools section |
| `supabase/config.toml` | No change needed |

No new DB migrations. All data fits in existing `knowledge_entries`, `api_integrations`, and `messages` tables.

