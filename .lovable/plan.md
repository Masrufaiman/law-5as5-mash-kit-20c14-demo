

# Fix Multiple UI Issues: Sidebar, Citations, Document Panel, Gen UI, Formatting

## Issues Identified

1. **Sidebar skeletons too prominent** — oversized white blocks; need subtle, compact placeholders matching sidebar text size
2. **Action buttons hidden until hover** — should always be visible (low opacity, full on hover)
3. **Multi-step questionnaire Gen UI** — when AI asks multiple questions, present them one-by-one as MCQ steps with a progress indicator; auto-submit combined answers after all answered
4. **"Need more info" responses → Gen UI** — detect patterns like "I don't have sufficient information" and show text input / MCQ gen UI
5. **StepTracker under "LK LawKit AI" header, collapsed by default** — move steps inside the assistant message bubble area, default collapsed
6. **Agent avatar** — replace "LK" text circle with a Bot/Agent icon (lucide `Bot`)
7. **Bold/markdown broken in document preamble** — the document card preamble uses a plain `<p>` tag, so `**bold**` shows raw asterisks; render with ReactMarkdown
8. **Citations still showing at bottom** — the `Citations:` block is coming from the AI's response text itself, not the UI. Need to strip `Citations:` suffix from content before rendering. The inline `[N]` popovers already work.
9. **Document rendering inline instead of right panel** — the `detectDocument` may fail if AI doesn't use `#` headings (image 4 shows bold text `**MUTUAL NON-DISCLOSURE AGREEMENT**` not `# heading`). Broaden detection to include `**ALL CAPS TITLE**` patterns.

---

## File Changes

### `src/components/NavigationSidebar.tsx`
- Replace vault skeletons: use `h-3.5` height, `bg-sidebar-accent/40` color, match sidebar text proportions
- Replace chat skeletons: same treatment, smaller and more subtle

### `src/components/chat/ResponseActions.tsx`
- Change from `opacity-0 group-hover:opacity-100` to `opacity-60 group-hover:opacity-100` so buttons are always lightly visible

### `src/components/chat/MessageBubble.tsx`
- **Agent avatar**: replace "LK" text with `<Bot>` icon from lucide for all assistant messages
- **Preamble rendering**: use `<ReactMarkdown>` for the document preamble instead of plain `<p>`
- **Broader document detection**: also detect `**ALL CAPS**` pattern at start + content > 500 chars
- **Strip citations block**: remove trailing `Citations: [N] ...` text from `message.content` before rendering (regex strip)
- **StepTracker integration**: move steps rendering inside the assistant message bubble, under the "LK LawKit AI" header, collapsed by default

### `src/components/chat/StepTracker.tsx`
- Default `open` state to `false` (collapsed by default)

### `src/components/chat/MultiStepQuestionnaire.tsx` (NEW)
- New component for multi-step question flow
- Detects pattern: multiple questions in numbered list, each with sub-options or needing user input
- Shows one question at a time with MCQ options + text input
- Progress indicator (step 1 of 3, etc.)
- After all questions answered, auto-submits combined answer as a single prompt
- Parsing: detect patterns like "1. What specific..." "2. What type..." "3. What is..."

### `src/components/chat/ChoiceCards.tsx`
- Add detection for "insufficient information" / "need more details" patterns
- When detected, show the AI's message text + MCQ/text input for user to provide context

### `src/pages/Chat.tsx`
- Move `StepTracker` rendering from after the user message to inside the assistant message area
- Pass `steps` to `MessageBubble` so it can render them under the avatar header

---

## Summary

| File | Change |
|------|--------|
| `NavigationSidebar.tsx` | Subtle, compact sidebar skeletons |
| `ResponseActions.tsx` | Always-visible action buttons (low opacity) |
| `MessageBubble.tsx` | Bot icon avatar, markdown preamble, broader doc detection, strip citations text, embed StepTracker |
| `StepTracker.tsx` | Default collapsed |
| `MultiStepQuestionnaire.tsx` | New multi-step MCQ questionnaire component |
| `ChoiceCards.tsx` | Handle "need more info" pattern |
| `Chat.tsx` | Pass steps to MessageBubble, remove standalone StepTracker render |

