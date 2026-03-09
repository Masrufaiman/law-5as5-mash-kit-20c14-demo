

# Phase 6: Multi-Model Perplexity Strategy in LLM Router

## What Changes

The llm-router currently uses a single Perplexity model (`sonar-pro` for search, `sonar-deep-research` for deep research). We need to use **4 different Perplexity models** based on the use case:

| Use Case | Perplexity Model | Trigger |
|----------|-----------------|---------|
| Regular chat/research | `sonar` | Default when sources selected |
| Deep Research | `sonar-deep-research` | User clicks Deep Research toggle |
| Red Flag Detection | `sonar-reasoning` | Message contains red flag / risk analysis intent |
| Review Tables | `sonar-pro` | Message asks for review table / comparison / extraction |

## File Changes

### 1. `supabase/functions/llm-router/index.ts`

**Replace the single model selection** (line 173: `const pplxModel = deepResearch ? "sonar-deep-research" : "sonar-pro"`) with use-case detection logic:

```
function selectPerplexityModel(message: string, deepResearch: boolean): string {
  if (deepResearch) return "sonar-deep-research";
  
  const lower = message.toLowerCase();
  // Red flag / risk analysis → reasoning model
  if (/red.?flag|risk.?analy|clause.?review|compliance.?check|due.?diligence/i.test(lower)) {
    return "sonar-reasoning";
  }
  // Review table / comparison / extraction → pro model (2x citations)
  if (/review.?table|compar|extract.?terms|obligation|provision|summar.*clause/i.test(lower)) {
    return "sonar-pro";
  }
  // Default: fast sonar
  return "sonar";
}
```

- Update the step name to show which model is being used (e.g., "Running deep research (sonar-deep-research)")
- Adjust `max_tokens` per model: `sonar` → 2048, `sonar-pro` → 4096, `sonar-reasoning` → 4096, `sonar-deep-research` → 8192
- Update the system prompt sent to Perplexity based on model:
  - `sonar`: brief legal research prompt
  - `sonar-reasoning`: "Analyze this contract/document for risks, red flags, problematic clauses. Reason step-by-step."
  - `sonar-pro`: "Extract structured data with maximum citations. Be thorough."
  - `sonar-deep-research`: "Conduct comprehensive multi-source legal research."

### 2. `src/components/admin/SearchTab.tsx`

Update the model selector description to reflect the use-case mapping. Remove `sonar-reasoning-pro` from the list. Change it from a "default model" dropdown to a read-only info card showing which model is used for which use case. The admin only needs to configure the API key and toggle web search / deep research.

### 3. `src/hooks/useStreamChat.ts`

Add a `useCase` field to `StreamChatOptions` so the frontend can hint at the use case (optional — the backend auto-detects from the message content, but explicit hints improve accuracy).

No other file changes needed. The Chat page and ChatInput already pass `deepResearch` and `sources` correctly.

