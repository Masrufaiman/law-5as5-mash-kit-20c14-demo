

# Plan: Citations Display, Send Button Fix, Follow-ups, and Agentic Response Polish

## Issues Identified

### 1. Citations/References appearing as raw paragraph text
The `stripCitationsBlock` regex catches some formats but misses the verbose `Citations: 1 filename — Page N: "excerpt" 2 filename...` format (no brackets, just numbers). The AI's final synthesis outputs a massive paragraph of citation data that isn't stripped.

### 2. Send button not working on conversation details page
**Root cause**: `ChatInput` calls `onClick={onSend}` on the Send button. React passes the `MouseEvent` as the first argument. In `Chat.tsx`, `onSend={handleSend}` where `handleSend(text?: string)` — the MouseEvent is received as `text`, it's truthy, so `(text || input).trim()` tries to call `.trim()` on a MouseEvent object, which throws. Enter key works because `handleKeyDown` calls `onSend()` with no arguments.

### 3. Follow-up questions not appearing consistently
The backend prompt already instructs `>>FOLLOWUP:` generation but it's only in the base prompt. The drafting and review mode prompts override the base prompt without always including the follow-up instruction. Need to ensure `followUpInstruction` is appended in ALL synthesis paths.

### 4. Thinking narration leaking into response
The `emitThinking()` text (e.g., "Embedding query and searching...") is rendered in the StepTracker as visible text. This is correct, but the AI's inner monologue `thinking_narration` sometimes contains verbose internal text that should be more concise in the UI. The thinking block styling needs refinement — it should feel like a subtle aside, not raw log output.

### 5. Step counter not closing at 4/4
The progress counter emits `current: iteration` but iteration is 0-indexed while plan length is the total. If the final iteration's monologue returns FINISH before incrementing, the counter stays at N-1/N.

## Implementation

### `src/pages/Chat.tsx` — Fix Send button
Wrap the `onSend` call: change `onSend={handleSend}` to `onSend={() => handleSend()}` so no event object is passed as `text`.

### `src/components/chat/MessageBubble.tsx` — Better citation stripping + collapsible citations
1. Expand `stripCitationsBlock` to catch the verbose format: `Citations: N filename — Page...` (numbers without brackets)
2. Move follow-up suggestions BELOW a new collapsible citations section
3. Add a collapsible "References — N cited" block that renders citations in a clean, multi-line, bullet-list format with filenames, page numbers, and excerpts — properly formatted, not as a wall of text

### `src/components/chat/StepTracker.tsx` — Thinking text styling refinement
- Make thinking text less log-like: smaller, more muted, better contained
- Ensure progress counter emits final count correctly

### `supabase/functions/llm-router/index.ts` — Backend fixes
1. Ensure `followUpInstruction` is appended to ALL mode prompts (it already is for drafting/review, but verify the chat base prompt path)
2. Add instruction to NOT output a "References:" or "Citations:" block — citations are already structured via the `done` event
3. Emit final progress as `plan.length / plan.length` before synthesis step
4. Instruct the AI to use tables for comparative data more aggressively

## File Changes

| File | Changes |
|------|---------|
| `src/pages/Chat.tsx` | Fix Send button: `onSend={() => handleSend()}` |
| `src/components/chat/MessageBubble.tsx` | Expand `stripCitationsBlock` regex; add collapsible references section with clean multi-line format; reorder follow-ups below references |
| `src/components/chat/StepTracker.tsx` | Refine thinking text styling |
| `supabase/functions/llm-router/index.ts` | Add "no References block" instruction to system prompt; emit final progress count; ensure follow-up instruction in all paths |

