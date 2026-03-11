

# Plan: Fix Selection Reply, Dynamic MCQs, Step Counter, and Web Search Fallback

## Issues

### 1. Selection Reply tooltip not working
The tooltip renders and `handleReplyWithSelection` sets `replyContext`, but clicking the Reply button triggers the `mousedown` handler on `document` which checks `target.closest("[data-reply-tooltip]")`. The issue: the tooltip button itself has `data-reply-tooltip` on the parent div, but the click fires `mousedown` first (clearing the tooltip) before `click` fires on the Reply button. The `mousedown` listener clears `selectionTooltip` to `null`, so by the time `handleReplyWithSelection` runs, it's already null.

**Fix in `Chat.tsx`:** Change the mousedown handler to check if the click target is inside the reply tooltip. Use a small delay or check event order. Simplest fix: in `handleMouseDown`, don't clear tooltip if target is inside `[data-reply-tooltip]` — this is already there but may not be working because the button click clears the text selection which triggers `handleMouseUp` with collapsed selection. Fix: add a ref-based flag `isReplyingRef` to prevent the mouseup handler from clearing the tooltip immediately after clicking Reply.

### 2. Static default MCQ choices instead of dynamic ones
In `ChoiceCards.tsx` line 68-73, `parseNeedMoreInfo` has hardcoded `defaultChoices` (Corporate Law, Contract Law, IP, Employment Law). When the AI says "I need more information" but doesn't include a numbered list, the parser falls through to line 102 and returns these static defaults. 

**Fix:** Remove the `defaultChoices` fallback entirely. If the AI's response matches "need more info" patterns but doesn't include actual numbered choices in the text, return `null` (don't show MCQ cards). The AI should generate its own relevant options. Also update the `llm-router` system prompt to instruct the AI to always include specific, context-relevant choices when asking for clarification.

### 3. Step counter showing impossible values (2/1, 2/3)
Two bugs:
- **Progress emits `iteration` (loop count) but total is `plan.length`** which changes with replans. If plan shrinks after iteration starts, you get 2/1.
- **Progress is emitted AFTER iteration increment** but the plan may have been replanned to fewer steps.

**Fix in `llm-router`:** Use `Math.max(iteration, currentPlan.length)` as total, and cap current to never exceed total. Also in `StepTracker.tsx`, clamp the display: `Math.min(progress.current, progress.total)`.

### 4. Web search should auto-trigger when Perplexity is available
Currently `needsWebSearch` in `analyzeIntent` is gated by `hasSources` (line 516): `needsWebSearch: hasSources ? ... : false`. This means if the user didn't explicitly select sources, the agent never triggers web search even when Perplexity is configured.

**Fix:** Change to allow web search whenever `perplexityKey` is available, not just when user selected sources. Pass `hasPerplexity` to `analyzeIntent`. The intent analyzer should set `needs_web_search: true` for any legal research query, regardless of whether the user toggled sources.

### 5. Plan quality — only 1 generic step
The `analyzeIntent` prompt is too minimal ("Analyze this legal query. Output structured plan."). It doesn't instruct the LLM to generate multi-step plans with vault search, web research, etc.

**Fix:** Enhance the `analyzeIntent` system prompt to instruct generating 3-7 specific actionable steps including vault search, web search, and synthesis.

## File Changes

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Fix selection reply race condition with ref flag |
| `src/components/chat/ChoiceCards.tsx` | Remove hardcoded `defaultChoices`; return null when no parsed choices |
| `src/components/chat/StepTracker.tsx` | Clamp progress display values |
| `supabase/functions/llm-router/index.ts` | Fix progress emit to cap values; enable web search when Perplexity available even without explicit sources; enhance intent prompt for better plans |

