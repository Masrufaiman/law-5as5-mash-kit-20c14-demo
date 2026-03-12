

# Plan: 7 Fixes — Reload Persistence, Web Sources, Highlighting, Google Drive, PDF Preview, Reply Tooltip, Google OAuth

## 1. Reload Persistence (sessionStorage → localStorage for input/config)

**Current state:** `Chat.tsx` lines 115-151 already save/restore `input`, `deepResearch`, `activeSources`, `promptMode`, `selectedVault`, `workflowTag` to `sessionStorage`. SessionStorage survives tab navigation but NOT page reloads in some scenarios and never survives tab close.

**Fix:** Change `sessionStorage` to `localStorage`. Also persist `attachedFiles` metadata (name, size, type) — actual File objects cannot be persisted, so show a "files were cleared" notice on reload. Persist `replyContext` too.

**File:** `src/pages/Chat.tsx` lines 119-151

## 2. Website Sources with Favicon, Title, and Link

**Current state:** `SourcesFooter.tsx` shows web citations with favicon + domain but only domain text, no page title. The `Citation` interface has `source` (filename/domain), `excerpt`, `url`, but no `title` field.

**Fix:**
- Add `title?: string` to the `Citation` interface in `useStreamChat.ts`
- Update `llm-router/index.ts` `toolWebSearch` to extract and return page titles from Perplexity search results in the citation SSE events
- Update `SourcesFooter.tsx` to display the page title instead of just the domain, with the domain shown smaller below

**Files:** `src/hooks/useStreamChat.ts`, `src/components/chat/SourcesFooter.tsx`, `supabase/functions/llm-router/index.ts`

## 3. Source File Highlighting in Right Panel

**Current state:** Already implemented. `DocumentEditor` lines 199-242 handle `highlightExcerpt` — scrolls to matching text and applies temporary yellow highlight. `handleFileClick` passes `excerpt` through to `handleDocumentOpen`.

**Issue:** The `CitationPopover` and `StepTracker` file ref clicks may not be passing the `excerpt` parameter. Need to verify the citation click handlers pass the excerpt.

**Fix:** Ensure `onFileClick` calls in `StepTracker` and `CitationPopover` pass the citation excerpt. Also in `SourcesPanel`, make citation clicks call `onFileClick` with the excerpt.

**Files:** `src/components/chat/StepTracker.tsx`, `src/components/chat/CitationPopover.tsx`, `src/components/chat/SourcesPanel.tsx`

## 4. Google Drive Integration

**Cannot be fully implemented without Google OAuth credentials.** Google Drive requires OAuth with `drive.readonly` scope. No Google connector exists in the workspace.

**What I can build now:**
- A "Google Drive" button in vault upload and prompt box upload areas
- An edge function `google-drive-import` that accepts a Google access token + file ID, downloads the file, and routes it through existing R2 upload + document-processor pipeline
- The Google Drive Picker JS integration (frontend) that opens Google's file picker UI

**Prerequisite:** User must provide a Google API Key and OAuth Client ID as Supabase secrets. The same Google Cloud project used for Auth can be reused — just add the Drive API scope.

**Files:** New `supabase/functions/google-drive-import/index.ts`, updates to `src/components/vault/VaultDetail.tsx` and `src/components/chat/ChatInput.tsx`

**I'll implement the UI buttons and edge function skeleton now; full activation requires Google credentials.**

## 5. PDF Preview in Vault

**Current state:** `VaultDetail.tsx` line 321 — `onFileClick={setPreviewFile}` opens a Dialog showing only metadata (name, type, size, status, etc). No content preview.

**Fix:** In the preview dialog, add a tab/section that shows `extracted_text` from the files table. For PDFs, also add a "View PDF" button that generates a signed download URL via the existing `r2-download` edge function and opens it in an iframe or new tab.

**File:** `src/components/vault/VaultDetail.tsx`

## 6. Reply Tooltip on AI Response Text Selection

**Current state:** The code exists (lines 357-413 in Chat.tsx) and looks correct. The `mouseup` listener is bound to `messagesContainerRef.current`.

**Bug:** The `useEffect` has `[]` deps and runs once on mount. If the component initially renders the empty state (no messages), `messagesContainerRef.current` is `null` because the ScrollArea containing `ref={messagesContainerRef}` is conditionally rendered (line 1010-1012: only renders when `messages.length > 0`). When messages appear later, the ref updates but the effect doesn't re-run.

**Fix:** Add `messages.length` to the dependency array so the effect re-runs when messages first appear. Also guard the cleanup to handle the case where the container ref was null on first run.

**File:** `src/pages/Chat.tsx` line 413: change `}, []);` to `}, [messages.length > 0]);`

## 7. Google OAuth 403 Error

**Root cause:** Auth logs show `"OAuth state parameter missing"` on the callback. The `redirectTo` is set to `window.location.origin` which is the Lovable preview domain (`985468dd-....lovableproject.com`). The Lovable auth-bridge intercepts the OAuth callback and strips the state parameter.

**Fix:** Use the `skipBrowserRedirect` pattern from the stack overflow context for non-lovable domains, and validate the OAuth URL before redirecting.

**File:** `src/pages/Auth.tsx` — replace the inline Google OAuth handler with the `skipBrowserRedirect` pattern.

**Also required (user action):** Ensure the Supabase Dashboard has:
- Site URL set to the preview/published URL
- Redirect URLs include `https://lawkitai.lovable.app/**` and `https://*.lovableproject.com/**`

## Implementation Order

1. Reply tooltip fix (1 line change)
2. Google OAuth fix (Auth.tsx rewrite)
3. Reload persistence (sessionStorage → localStorage)
4. Web sources enhancement (Citation title, SourcesFooter UI)
5. Source file highlighting pass-through
6. PDF preview in vault
7. Google Drive UI skeleton + edge function

## File Changes Summary

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Fix reply tooltip deps; localStorage persistence; source click excerpt pass-through |
| `src/pages/Auth.tsx` | Google OAuth `skipBrowserRedirect` fix |
| `src/hooks/useStreamChat.ts` | Add `title` to Citation interface |
| `src/components/chat/SourcesFooter.tsx` | Show page title + favicon + link for web sources |
| `src/components/chat/SourcesPanel.tsx` | Add onFileClick prop, pass excerpt on citation click |
| `src/components/vault/VaultDetail.tsx` | PDF content preview with extracted text + download link |
| `supabase/functions/llm-router/index.ts` | Include page titles in citation SSE events |
| `supabase/functions/google-drive-import/index.ts` | **New** — skeleton edge function for Drive file import |

