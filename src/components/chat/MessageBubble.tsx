import React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ResponseActions } from "./ResponseActions";
import { CitationPopover } from "./CitationPopover";
import { ChoiceCards, parseChoices } from "./ChoiceCards";
import { MultiStepQuestionnaire, parseMultiStepQuestions } from "./MultiStepQuestionnaire";
import { StepTracker } from "./StepTracker";
import { SourcesFooter } from "./SourcesFooter";
import { FollowUpSuggestions } from "./FollowUpSuggestions";
import { Card } from "@/components/ui/card";
import { FileText, Bot } from "lucide-react";
import type { ChatMessage, Citation, AgentStep } from "@/hooks/useStreamChat";

interface MessageBubbleProps {
  message: ChatMessage;
  nextMessage?: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onChoiceSelect?: (text: string) => void;
  onDocumentOpen?: (title: string, content: string) => void;
  isLastAssistant?: boolean;
  steps?: AgentStep[];
  isStreamingSteps?: boolean;
  onFollowUp?: (text: string) => void;
}

// Map Unicode superscript digits to normal digits
const SUPERSCRIPT_MAP: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
};

function superscriptToNumber(s: string): number {
  const digits = s.split("").map((c) => SUPERSCRIPT_MAP[c] || c).join("");
  return parseInt(digits, 10);
}

/**
 * Recursively process React children to replace citation patterns with CitationPopover components.
 */
function processChildren(
  children: React.ReactNode,
  citations: Citation[]
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      return injectCitations(child, citations);
    }
    if (React.isValidElement(child) && child.props?.children) {
      return React.cloneElement(child, {
        ...child.props,
        children: processChildren(child.props.children, citations),
      } as any);
    }
    return child;
  });
}

// Match [N], [¹], [², ³], superscript groups like ¹²³, and standalone superscripts
const CITATION_PATTERN = /(\[\d+\]|\[[\u2070\u00b9\u00b2\u00b3\u2074-\u2079][,\s\u2070\u00b9\u00b2\u00b3\u2074-\u2079]*\]|[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+)/g;

function injectCitations(text: string, citations: Citation[]): React.ReactNode[] {
  const parts = text.split(CITATION_PATTERN);
  if (parts.length === 1) return [text];

  return parts.map((part, i) => {
    // Try [N] format
    const bracketMatch = part.match(/^\[(\d+)\]$/);
    if (bracketMatch) {
      const idx = parseInt(bracketMatch[1], 10);
      const citation = citations.find((c) => c.index === idx);
      if (citation) return <CitationPopover key={`cite-${idx}-${i}`} citation={citation} />;
    }

    // Try [superscript] format like [², ⁴] or standalone superscripts
    const superscriptChars = part.replace(/[\[\],\s]/g, "");
    if (/^[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+$/.test(superscriptChars)) {
      // Split into individual superscript numbers
      const nums = part.replace(/[\[\]]/g, "").split(/[,\s]+/).filter(Boolean);
      const elements: React.ReactNode[] = [];
      nums.forEach((num, j) => {
        const trimmed = num.trim();
        if (!trimmed) return;
        const idx = superscriptToNumber(trimmed);
        // Perplexity citations start at index 100+
        const citation = citations.find((c) => c.index === idx || c.index === idx + 99);
        if (citation) {
          elements.push(<CitationPopover key={`cite-s-${idx}-${i}-${j}`} citation={{ ...citation, index: idx }} />);
        } else {
          elements.push(<CitationPopover key={`cite-s-${idx}-${i}-${j}`} citation={{ index: idx, source: `Source ${idx}`, excerpt: "" }} />);
        }
      });
      if (elements.length > 0) return <>{elements}</>;
    }

    return part;
  });
}

/** Strip trailing "Citations:", "Sources:", "References:" blocks and --- separators from content */
function stripCitationsBlock(content: string): string {
  return content
    // Strip --- followed by Sources/Citations/References block
    .replace(/\n{0,3}---+\s*\n{0,3}(?:(?:Citations|Sources|References)\s*:?\s*\n[\s\S]*)?$/i, "")
    // Strip standalone Sources/Citations/References block at end
    .replace(/\n{1,2}(?:Citations|Sources|References)\s*:?\s*\n[\s\S]*$/i, "")
    // Strip "Sources:" lines with superscript refs
    .replace(/\n{1,2}Sources?\s*:?\s*\n(?:\[?[\u2070\u00b9\u00b2\u00b3\u2074-\u2079\d][\s\S]*)?$/i, "")
    .trim();
}

/** Detect if content is a document/draft (heading + long content, or bold ALL-CAPS title) */
function detectDocument(content: string): { title: string } | null {
  const headingMatch = content.match(/^#\s+(.+)/m) || content.match(/^##\s+(.+)/m);
  if (headingMatch && content.length > 500) return { title: headingMatch[1] };

  const boldMatch = content.match(/^\*\*([A-Z][A-Z\s\-–—,]+[A-Z])\*\*/m);
  if (boldMatch && content.length > 500) return { title: boldMatch[1] };

  return null;
}

/** Agent avatar component */
function AgentAvatar({ isUser }: { isUser: boolean }) {
  return (
    <div
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full shrink-0",
        isUser
          ? "bg-primary/20 text-primary text-[10px] font-bold"
          : "bg-muted text-muted-foreground"
      )}
    >
      {isUser ? "U" : <Bot className="h-3.5 w-3.5" />}
    </div>
  );
}

export function MessageBubble({
  message,
  nextMessage,
  isStreaming,
  onRegenerate,
  onChoiceSelect,
  onDocumentOpen,
  isLastAssistant,
  steps,
  isStreamingSteps,
  onFollowUp,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const citations = message.citations || [];
  const followUps = message.followUps || [];

  // Clean content: strip trailing citations block from AI text
  const cleanContent = !isUser ? stripCitationsBlock(message.content) : message.content;

  // Determine if a choice was already selected (next message is the user's selection)
  const alreadySelected = nextMessage?.role === "user" ? nextMessage.content : null;

  // Detect multi-step questionnaire pattern
  const questionnaireData = !isUser && !isStreaming && onChoiceSelect
    ? parseMultiStepQuestions(cleanContent)
    : null;

  // Detect choice patterns in assistant messages
  const choiceData = !isUser && !isStreaming && onChoiceSelect && !questionnaireData
    ? parseChoices(cleanContent)
    : null;

  // Whether this gen UI is interactive
  const isInteractive = isLastAssistant && !alreadySelected;

  // Detect document patterns
  const docInfo = !isUser && !isStreaming ? detectDocument(cleanContent) : null;

  // Build custom components that inject inline citation popovers
  const citeComponents = React.useMemo(() => {
    if (!citations.length) return {};

    const wrap = (tag: string, className: string) => {
      const Comp = ({ children }: { children?: React.ReactNode }) => {
        const processed = processChildren(children, citations);
        return React.createElement(tag, { className }, processed);
      };
      return Comp;
    };

    return {
      p: wrap("p", "text-sm text-foreground/90 my-1.5 leading-relaxed"),
      li: ({ children }: { children?: React.ReactNode }) => (
        <li>{processChildren(children, citations)}</li>
      ),
      td: wrap("td", "px-3 py-2 border-b border-border text-xs"),
      th: wrap("th", "bg-muted/50 px-3 py-2 text-left font-medium text-foreground border-b border-border text-xs"),
      h1: wrap("h1", "text-lg font-semibold text-foreground mt-4 mb-2"),
      h2: wrap("h2", "text-base font-semibold text-foreground mt-3 mb-1.5"),
      h3: wrap("h3", "text-sm font-semibold text-foreground mt-2 mb-1"),
      h4: wrap("h4", "text-sm font-medium text-foreground mt-2 mb-1"),
      h5: wrap("h5", "text-xs font-medium text-foreground mt-1.5 mb-0.5"),
      h6: wrap("h6", "text-xs font-medium text-muted-foreground mt-1.5 mb-0.5"),
      blockquote: ({ children }: { children?: React.ReactNode }) => (
        <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic">
          {processChildren(children, citations)}
        </blockquote>
      ),
    };
  }, [citations]);

  // Steps section (with reasoning)
  const stepsSection = !isUser && (steps?.length || message.reasoning) ? (
    <div className="mb-2">
      <StepTracker steps={steps || []} isStreaming={isStreamingSteps} reasoning={message.reasoning} />
    </div>
  ) : null;

  // Sources footer (only for non-streaming assistant messages with citations)
  const sourcesFooter = !isUser && !isStreaming && citations.length > 0 ? (
    <SourcesFooter citations={citations} />
  ) : null;

  // Follow-up suggestions
  const followUpSection = !isUser && !isStreaming && followUps.length > 0 && isLastAssistant && onFollowUp ? (
    <FollowUpSuggestions suggestions={followUps} onSelect={onFollowUp} />
  ) : null;

  // Render document as compact card instead of full content
  if (docInfo && onDocumentOpen) {
    return (
      <div className="group">
        <div className="flex items-center gap-2 mb-2">
          <AgentAvatar isUser={false} />
          <span className="text-xs font-semibold text-foreground">LawKit AI</span>
        </div>

        <div className="pl-8 space-y-3">
          {stepsSection}

          {(() => {
            const firstHeadingIdx = cleanContent.search(/^(?:#{1,2}\s+|\*\*[A-Z])/m);
            const intro = firstHeadingIdx > 0 ? cleanContent.slice(0, firstHeadingIdx).trim() : null;
            return intro ? (
              <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-none">
                <ReactMarkdown>{intro}</ReactMarkdown>
              </div>
            ) : null;
          })()}

          <Card
            className="cursor-pointer border-border/60 hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 p-0"
            onClick={() => onDocumentOpen(docInfo.title, cleanContent)}
          >
            <div className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{docInfo.title}</p>
                <p className="text-xs text-muted-foreground">Click to open in editor</p>
              </div>
            </div>
          </Card>

          {sourcesFooter}
          {followUpSection}

          {!isStreaming && cleanContent && (
            <ResponseActions
              content={cleanContent}
              messageId={message.id}
              onRegenerate={onRegenerate}
            />
          )}
        </div>
      </div>
    );
  }

  // Render multi-step questionnaire
  if (questionnaireData && onChoiceSelect) {
    return (
      <div className="group">
        <div className="flex items-center gap-2 mb-2">
          <AgentAvatar isUser={false} />
          <span className="text-xs font-semibold text-foreground">LawKit AI</span>
        </div>

        <div className="pl-8">
          {stepsSection}
          <MultiStepQuestionnaire
            preamble={questionnaireData.preamble}
            questions={questionnaireData.questions}
            onComplete={onChoiceSelect}
            disabled={isStreaming || !isInteractive}
            selectedValue={alreadySelected}
          />

          {sourcesFooter}
          {followUpSection}

          {!isStreaming && cleanContent && (
            <div className="mt-2">
              <ResponseActions
                content={cleanContent}
                messageId={message.id}
                onRegenerate={onRegenerate}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render choice cards
  if (choiceData && onChoiceSelect) {
    return (
      <div className="group">
        <div className="flex items-center gap-2 mb-2">
          <AgentAvatar isUser={false} />
          <span className="text-xs font-semibold text-foreground">LawKit AI</span>
        </div>

        <div className="pl-8">
          {stepsSection}
          <ChoiceCards
            choices={choiceData.choices}
            preamble={choiceData.preamble}
            onSelect={onChoiceSelect}
            disabled={isStreaming || !isInteractive}
            selectedValue={alreadySelected}
          />

          {sourcesFooter}
          {followUpSection}

          {!isStreaming && cleanContent && (
            <div className="mt-2">
              <ResponseActions
                content={cleanContent}
                messageId={message.id}
                onRegenerate={onRegenerate}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-2">
        <AgentAvatar isUser={isUser} />
        <span className="text-xs font-semibold text-foreground">
          {isUser ? "You" : "LawKit AI"}
        </span>
      </div>

      <div className="pl-8">
        {!isUser && stepsSection}

        {isUser ? (
          <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90 prose-td:text-foreground prose-th:text-foreground prose-a:text-primary prose-code:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {children}
                  </a>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3 rounded-md border border-border">
                    <table className="w-full text-xs">{children}</table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-muted/50">{children}</thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-border last:border-b-0">{children}</tr>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 space-y-0.5 my-2">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 space-y-0.5 my-2">{children}</ol>
                ),
                hr: () => <hr className="my-4 border-border" />,
                code: ({ children, className }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code className={cn("text-xs font-mono", className)}>
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="bg-muted border border-border rounded-md p-3 overflow-x-auto my-3 text-xs">
                    {children}
                  </pre>
                ),
                ...citeComponents,
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          </div>
        )}

        {isStreaming && !isUser && (
          <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom rounded-full" />
        )}

        {!isUser && !isStreaming && sourcesFooter}
        {!isUser && !isStreaming && followUpSection}

        {!isUser && !isStreaming && cleanContent && (
          <ResponseActions
            content={cleanContent}
            messageId={message.id}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}
