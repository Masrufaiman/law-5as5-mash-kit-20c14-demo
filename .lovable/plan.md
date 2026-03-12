

# Plan: Legal API Configs, Deep Research Refinement, Google Integration Prep

This is a 4-part request. I'll scope what's implementable now vs. what requires external setup.

## Status Check — What's Already Correct

The doc's correction about "Perplexity = search only, LLM = chat completion" is **already implemented correctly**:
- `llm_configs` table stores OpenAI/Gemini/Anthropic for chat completion (line 748-753 in llm-router)
- Perplexity is only used in `toolWebSearch` for search/research
- No changes needed for point 4

## Part 1: Deep Research Trigger Refinement

Already handled by the `classifyRequestType` function and complexity scoring. Deep research only triggers when:
- User explicitly toggles it on, OR
- Complexity score >= 9

No additional changes needed — the routing logic from the last message already handles this.

## Part 2: Add CourtListener, EDGAR, EUR-Lex API Config in Admin Panel

Create a new **Legal APIs** tab in the Admin panel with dedicated config cards for these 3 real APIs.

**New file: `src/components/admin/LegalApisTab.tsx`**
- Three config cards: CourtListener, EDGAR, EUR-Lex
- CourtListener: API key input (Token auth), toggle active
- EDGAR: No API key needed (free), but requires User-Agent config, toggle active
- EUR-Lex: No API key needed (free), toggle active
- All stored in `api_integrations` table with providers: `courtlistener`, `edgar`, `eurlex`

**Edit: `src/pages/Admin.tsx`**
- Add new "Legal APIs" tab with Scale icon between "Search & Research" and "Storage"

**Edit: `supabase/functions/llm-router/index.ts`**
- Load CourtListener/EDGAR/EUR-Lex configs from `api_integrations`
- Add `toolCourtListener`, `toolEdgar`, `toolEurLex` functions that call the real APIs
- Update `classifyRequestType` to detect SEC/EDGAR signals and EU law signals
- Wire into the ReAct loop tool selection

### CourtListener API Implementation
```
GET https://www.courtlistener.com/api/rest/v3/search/?q={query}&type=o&format=json
Headers: Authorization: Token {key}, Accept: application/json
```

### EDGAR API Implementation  
```
GET https://efts.sec.gov/LATEST/search-index?q={query}&forms={form_type}
Headers: User-Agent: LawKit/1.0 contact@lawkit.ai
```

### EUR-Lex Implementation
```
GET https://eur-lex.europa.eu/search.html?type=quick&lang=en&text={query}
```
Parse HTML results or use the SPARQL endpoint for structured data.

## Part 3: Google Auth + Google Drive

This requires **external setup** that can't be done purely in code:

### Google Auth (Sign-in with Google)
- You need to configure Google OAuth in the **Supabase Dashboard** under Authentication > Providers > Google
- Steps: Create Google Cloud project, get OAuth Client ID/Secret, add them in Supabase Dashboard
- The code change is minimal: add a "Sign in with Google" button on the Auth page using `supabase.auth.signInWithOAuth({ provider: 'google' })`

### Google Drive Integration
Since there's no Google Drive connector available in the workspace, this needs a custom implementation:
- **New edge function `google-drive-picker`**: Uses Google Drive Picker API to let users select files
- **New edge function `google-drive-import`**: Downloads selected files from Drive and processes them through the existing R2 upload + document-processor pipeline
- Google Drive files get treated identically to uploaded files (same `files` table, same processing)
- Requires: Google API Key + OAuth Client ID stored as secrets

### Google Docs / Google Sheets Export
- "Open in Google Docs": Export document content as .docx via the existing download flow, then offer to upload to Drive
- "Open in Google Sheets": Export review table as CSV/XLSX and offer Drive upload
- These are simpler — they use the Google Drive API's upload endpoint

**I recommend implementing this in phases:**
1. **This message**: Admin panel Legal APIs tab + CourtListener/EDGAR/EUR-Lex in llm-router + Google Auth button
2. **Next message**: Google Drive picker + import for vault/prompt uploads
3. **Next message**: Google Docs/Sheets export integration

## Part 4: Architecture Corrections from the Guide

The guide confirms what's already implemented. Key items already correct:
- Perplexity = search only (sonar/sonar-pro/sonar-deep-research)
- LLM = chat completion via admin-configured providers
- 4-type routing classification
- Jurisdiction prefix map

No code changes needed for this point.

## Implementation Plan (This Message)

| File | Changes |
|------|---------|
| `src/components/admin/LegalApisTab.tsx` | **New** — CourtListener, EDGAR, EUR-Lex config cards with API key inputs and toggles |
| `src/pages/Admin.tsx` | Add "Legal APIs" tab |
| `supabase/functions/llm-router/index.ts` | Add `toolCourtListener`, `toolEdgar`, `toolEurLex` functions; load configs; wire into tool selection |
| `src/pages/Auth.tsx` | Add "Sign in with Google" button |

## Google Auth Setup Required

Before the Google Auth button works, you'll need to:
1. Go to Google Cloud Console → Create OAuth 2.0 credentials
2. Add `https://vwubsnhtujfmwsiwdihq.supabase.co/auth/v1/callback` as redirect URL
3. Add the Client ID and Secret in Supabase Dashboard → Authentication → Providers → Google

