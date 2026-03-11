
Goal: fix the remaining attachment, export, clarification UI, red-flag, drafting-streaming, and dropdown usability issues without large destructive changes.

1. Export formats: remove .md/.html as the primary export paths
- Chat/conversation export: switch from Markdown to plain text and PDF.
- Response action export: switch from Markdown to plain text/PDF for normal chat answers.
- Document editor export: replace Markdown/HTML export with DOC-compatible and PDF-focused export.
- Sheet/review table export: keep CSV only for table/sheet artifacts.
- Technical files: `src/pages/Chat.tsx`, `src/components/chat/ResponseActions.tsx`, `src/components/editor/DocumentEditor.tsx`, `src/components/editor/SheetEditor.tsx`.

2. Fix broken custom-question UI
- The current UI is inferred from markdown lists (`ChoiceCards`, `MultiStepQuestionnaire`) and is misfiring on analytical output.
- Tighten detection rules so only true clarification prompts render as interactive cards/forms.
- Add a safer fallback: if the content is long, analytical, file-heavy, or clause-heavy, render plain markdown instead of the custom question widget.
- Technical files: `src/components/chat/ChoiceCards.tsx`, `src/components/chat/MultiStepQuestionnaire.tsx`, `src/components/chat/MessageBubble.tsx`.

3. Stop red-flag mode from asking “which file?” when files are attached
- Treat explicit `attachedFileIds` as the highest-priority context.
- In `llm-router`, if attached files exist, skip vault-wide ambiguity logic and force direct file reading first.
- Update the prompt so red-flag mode must analyze all attached files unless the user explicitly narrows scope.
- Keep Uploads vault scoped to current attached files only.
- Technical files: `supabase/functions/llm-router/index.ts`, `src/pages/Chat.tsx`.

4. Make attachment pipeline behave exactly like vault uploads
- Ensure prompt-box uploads always:
  - go to default Uploads vault,
  - trigger OCR,
  - generate embeddings,
  - save metadata,
  - wait for ready/error states before the AI run.
- Unify Home and Chat upload paths so both use the same post-upload readiness behavior and status expectations.
- Technical files: `src/pages/Home.tsx`, `src/pages/Chat.tsx`, review `supabase/functions/document-processor/index.ts` integration only if needed.

5. Hide drafting/review/red-flag raw streaming from chat
- For drafting/review/red-flag outputs, do not show raw generated body in the chat bubble while streaming.
- Instead:
  - open/right-panel placeholder immediately,
  - show skeleton/loading state beside the artifact card in chat,
  - only reveal the final compact artifact card after completion.
- Keep normal research/chat answers streaming in chat.
- Technical files: `src/components/chat/MessageBubble.tsx`, `src/pages/Chat.tsx`.

6. Make source/vault dropdowns properly scrollable
- Constrain dropdown section heights and wrap long lists in scroll areas.
- Ensure vault names, sources, and KB entries truncate visually but remain accessible.
- Technical files: `src/components/chat/ChatInput.tsx`.

7. Design notes based on the screenshots/code
- The “broken custom question” issue is likely from heuristic parsing, not layout alone.
- The “bullshit red flag” issue comes from agent flow: attached files are being treated as generic vault context instead of explicit target docs.
- Export behavior is still clearly Markdown/HTML in code today.
- Uploads vault is already created and document-processor already performs OCR/embed/metadata; the missing part is consistent scoping/readiness and frontend flow.

Implementation order
1) attachment scoping + red-flag logic
2) hide raw drafting/review/red-flag streaming
3) clarification UI parsing hardening
4) export format cleanup
5) dropdown scroll polish

Technical acceptance criteria
- Attached-file prompt never asks user to pick a file when files are explicitly attached.
- Red-flag mode analyzes attached files directly.
- Draft/review/red-flag content streams into sidebar experience, not raw chat text.
- Custom clarification UI only appears for true clarification prompts.
- Chat/doc exports are TXT/PDF; sheets export CSV.
- Sources/vault dropdowns scroll cleanly with long lists.
