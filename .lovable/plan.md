

# Phase 7: Chat UX Polish — Steps, Streaming, Recent Chats, Workflows

## Issues Identified

1. **Steps/StepTracker position**: Currently shows above/between messages. Should show BELOW the AI response as a collapsible summary.
2. **Steps need animated text**: Show "Searching...", "Deep researching..." with animated shrinking/typing effect instead of static text.
3. **Tables render as raw markdown**: The `ReactMarkdown` component has custom table renderers but they may not handle `thead`/`tbody` properly. Need to add `thead`, `tbody`, `tr` components.
4. **Streaming may break**: The SSE parsing in `useStreamChat.ts` has a bug — when JSON parse fails, it puts the line back into buffer (`buffer = line + "\n" + buffer`) which can cause infinite loops. Fix: just skip bad lines.
5. **Headings not rendering**: The `ReactMarkdown` custom components for h1-h3 work but h4/h5/h6 are missing. Also need to ensure the prose classes don't override.
6. **Recent chats not in sidebar**: `NavigationSidebar.tsx` has no conversation history section. Need to load recent conversations and show them.
7. **Workflow cards not clickable**: The workflow buttons in `Home.tsx` have no `onClick` handler — they should navigate to chat with a pre-filled prompt.
8. **Prompts button behavior**: Currently dumps the full system prompt into the textarea. Instead, prompts should be used as BACKGROUND system context sent to the AI, and the button should show user-friendly workflow labels, not raw prompts.

---

## File Changes

### 1. `src/components/chat/StepTracker.tsx` — Animated, Below Response

- Add CSS animation for step text (fade-in + slight slide)
- Show dynamic status text: "Searching web...", "Analyzing with sonar-reasoning...", "Generating response..." 
- When streaming, show a pulsing dot next to working steps
- Collapsible after done: show "Completed in N steps" with expand toggle

### 2. `src/components/chat/MessageBubble.tsx` — Fix Markdown Rendering

- Add missing `thead`, `tbody`, `tr` components to ReactMarkdown
- Add `h4`, `h5`, `h6` components
- Add `p` component to ensure paragraph spacing
- Add `code` and `pre` components for code blocks
- Add `hr` component

### 3. `src/hooks/useStreamChat.ts` — Fix Streaming Bug

- Remove the problematic `buffer = line + "\n" + buffer; break;` in the catch block that causes infinite loops
- Just skip unparseable lines instead

### 4. `src/pages/Chat.tsx` — Move StepTracker Below AI Response

- Move StepTracker to render AFTER the assistant message, not between user and assistant
- When streaming and no assistant message yet, show StepTracker as a standalone animated block

### 5. `src/components/NavigationSidebar.tsx` — Add Recent Chats

- Load recent 10 conversations from `conversations` table
- Show them in a "Recent" section between main nav and bottom nav
- Click to navigate to `/chat?id={conversationId}` and load history

### 6. `src/pages/Chat.tsx` — Load Conversation from URL

- Read `?id=` query param, load messages from DB, populate chat via `loadHistory`

### 7. `src/pages/Home.tsx` — Fix Workflows + Prompts

- **Workflows**: Add `onClick` to each workflow card that navigates to `/chat` with `initialMessage` set to a descriptive prompt for that workflow
- **Prompts button**: Instead of dumping raw system prompts into the textarea, show prompt labels. On click, set a `systemPromptOverride` that gets passed to the chat as background context (not visible in textarea). Show a chip "Using: Red Flag Detection" in the prompt box instead.

### 8. `src/pages/Home.tsx` + `src/pages/Chat.tsx` — Pass System Prompt Override

- Add `promptMode` to the navigation state: `{ mode: "chat" | "red_flags" | "drafting", label: string }`
- Pass it through to `useStreamChat` → `llm-router` as `promptMode`
- The llm-router already reads `agentConf.prompts` — just need to select the right one based on `promptMode`

### 9. `supabase/functions/llm-router/index.ts` — Support promptMode

- Read `promptMode` from request body
- If `promptMode === "red_flags"`, use `agentConf.prompts.red_flags` as system prompt
- If `promptMode === "drafting"`, use `agentConf.prompts.drafting`
- Default to `agentConf.prompts.chat` or base prompt

---

## Summary

| File | Change |
|------|--------|
| `StepTracker.tsx` | Animated steps, collapsible, pulsing dots |
| `MessageBubble.tsx` | Fix table/heading/markdown rendering |
| `useStreamChat.ts` | Fix infinite loop bug in SSE parsing |
| `Chat.tsx` | Move steps below response, load conversation from URL, recent chats |
| `NavigationSidebar.tsx` | Add recent conversations section |
| `Home.tsx` | Fix workflows onClick, fix prompts to use background mode |
| `llm-router/index.ts` | Support `promptMode` for selecting system prompt |

