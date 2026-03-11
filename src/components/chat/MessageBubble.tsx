import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { ResponseActions } from "./ResponseActions";
import { CitationPopover } from "./CitationPopover";
import { ChoiceCards, parseChoices } from "./ChoiceCards";
import { MultiStepQuestionnaire, parseMultiStepQuestions } from "./MultiStepQuestionnaire";
import { StepTracker } from "./StepTracker";
import { FollowUpSuggestions } from "./FollowUpSuggestions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { FileText, Bot, Copy, Pencil, Database, Paperclip, Table2, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import type { ChatMessage, Citation, AgentStep, SearchSource, FileRef, InlineDataTable, Contradiction, Verification, Escalation, IntentData } from "@/hooks/useStreamChat";
import type { SheetData } from "@/components/editor/SheetEditor";

interface MessageBubbleProps {
  message: ChatMessage;
  nextMessage?: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onChoiceSelect?: (text: string) => void;
  onDocumentOpen?: (title: string, content: string) => void;
  onSheetOpen?: (data: SheetData) => void;
  isLastAssistant?: boolean;
  steps?: AgentStep[];
  isStreamingSteps?: boolean;
  searchSources?: SearchSource | null;
  onFollowUp?: (text: string) => void;
  onEditMessage?: (messageId: string, content: string) => void;
  plan?: string[];
  thinkingText?: string;
  fileRefs?: FileRef[];
  conversationId?: string;
  inlineData?: InlineDataTable[];
  contradictions?: Contradiction[];
  verifications?: Verification[];
  escalations?: Escalation[];
  selfCheckStatus?: string | null;
  intent?: IntentData | null;
  planUpdateReason?: string | null;
  progress?: { current: number; total: number } | null;
  onFileClick?: (fileName: string, fileId?: string, excerpt?: string) => void;
}

/** User message action bar (edit, copy) */
function UserMessageActions({ content, onEdit }: { content: string; onEdit?: () => void }) {
  const { toast } = useToast();

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Message copied to clipboard" });
  };

  return (
    <div className="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {onEdit && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={onEdit}
          title="Edit"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={copyToClipboard}
        title="Copy"
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** Attachment badges (vault, files) shown under user messages */
function AttachmentBadges({ attachments }: { attachments: ChatMessage["attachments"] }) {
  if (!attachments) return null;
  const { vaultName, fileNames } = attachments;
  if (!vaultName && (!fileNames || fileNames.length === 0)) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {vaultName && (
        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1 font-normal">
          <Database className="h-2.5 w-2.5" />
          {vaultName}
        </Badge>
      )}
      {fileNames?.map((name, i) => (
        <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5 gap-1 font-normal">
          <Paperclip className="h-2.5 w-2.5" />
          {name}
        </Badge>
      ))}
    </div>
  );
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

const CITATION_PATTERN = /(\[\*{0,2}\d+\*{0,2}\]|\[[\u2070\u00b9\u00b2\u00b3\u2074-\u2079][,\s\u2070\u00b9\u00b2\u00b3\u2074-\u2079]*\]|[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+)/g;

function injectCitations(text: string, citations: Citation[]): React.ReactNode[] {
  const parts = text.split(CITATION_PATTERN);
  if (parts.length === 1) return [text];

  return parts.map((part, i) => {
    const bracketMatch = part.match(/^\[\*{0,2}(\d+)\*{0,2}\]$/);
    if (bracketMatch) {
      const idx = parseInt(bracketMatch[1], 10);
      const citation = citations.find((c) => c.index === idx);
      if (citation) return <CitationPopover key={`cite-${idx}-${i}`} citation={citation} />;
    }

    const superscriptChars = part.replace(/[\[\],\s]/g, "");
    if (/^[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+$/.test(superscriptChars)) {
      const nums = part.replace(/[\[\]]/g, "").split(/[,\s]+/).filter(Boolean);
      const elements: React.ReactNode[] = [];
      nums.forEach((num, j) => {
        const trimmed = num.trim();
        if (!trimmed) return;
        const idx = superscriptToNumber(trimmed);
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

function stripCitationsBlock(content: string): string {
  return content
    .replace(/\n{0,3}---+\s*\n{0,3}(?:(?:Citations|Sources|References)\s*:?\s*\n[\s\S]*)?$/i, "")
    .replace(/\n{1,2}(?:Citations|Sources|References)\s*:?\s*\n[\s\S]*$/i, "")
    .replace(/\n{1,2}Sources?\s*:?\s*\n(?:\[?[\u2070\u00b9\u00b2\u00b3\u2074-\u2079\d][\s\S]*)?$/i, "")
    // Strip verbose inline references block: "References: [¹] filename — Page N: "excerpt" [²]..."
    .replace(/\n{0,3}References\s*:\s*\[[\u2070\u00b9\u00b2\u00b3\u2074-\u2079\d\*]+\][\s\S]*$/i, "")
    // Strip verbose "Citations: 1 filename — Page N: ..." (numbers without brackets)
    .replace(/\n{0,3}Citations\s*:\s*\d+\s+\S[\s\S]*$/i, "")
    // Strip verbose "Citations: [1] filename ..." or "References: 1. filename ..."
    .replace(/\n{0,3}(?:Citations|References)\s*:\s*(?:\[?\d+\]?\.?\s+\S[\s\S]*)$/i, "")
    .trim();
}

function detectDocument(content: string): { title: string } | null {
  if (content.includes("<!-- SHEET:")) return null;
  const headingMatch = content.match(/^#\s+(.+)/m) || content.match(/^##\s+(.+)/m);
  if (headingMatch && content.length > 500) return { title: headingMatch[1] };

  const boldMatch = content.match(/^\*\*([A-Z][A-Z\s\-–—,]+[A-Z])\*\*/m);
  if (boldMatch && content.length > 500) return { title: boldMatch[1] };

  return null;
}

function detectSheet(content: string): SheetData | null {
  const match = content.match(/<!--\s*SHEET:\s*(.+?)\s*-->\s*```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[2]);
    return {
      title: match[1].trim(),
      columns: parsed.columns || [],
      rows: parsed.rows || [],
    };
  } catch {
    return null;
  }
}
/** Collapsible References section */
function CollapsibleReferences({ citations, onFileClick }: { citations: Citation[]; onFileClick?: (fileName: string, fileId?: string) => void }) {
  const [open, setOpen] = React.useState(false);

  // Group citations by source file
  const grouped = React.useMemo(() => {
    const map = new Map<string, Citation[]>();
    citations.forEach((c) => {
      const key = c.source || `Source ${c.index}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries());
  }, [citations]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-3 group cursor-pointer">
        <BookOpen className="h-3.5 w-3.5" />
        <span>
          References{" — "}
          <span className="font-medium text-foreground">{citations.length} cited</span>
        </span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 ml-1 space-y-2 border-l-2 border-border/40 pl-3">
          {grouped.map(([source, cites]) => {
            const isFile = !cites[0]?.url;
            const displayName = source.replace(/\s*[·\-–—]\s*(chunk|part|section)\s*\d+.*/i, "").trim();
            return (
              <div key={source} className="space-y-1">
                <button
                  onClick={() => isFile && onFileClick?.(displayName)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium",
                    isFile ? "text-primary hover:underline cursor-pointer" : "text-foreground"
                  )}
                >
                  <FileText className="h-3 w-3 shrink-0" />
                  {displayName}
                </button>
                {cites.map((c) => {
                  // Extract page number from excerpt or source
                  const pageMatch = c.source?.match(/[Pp]age\s*(\d+)/i) || c.excerpt?.match(/[Pp]age\s*(\d+)/i);
                  return (
                    <div key={c.index} className="flex items-start gap-2 text-[11px] text-muted-foreground pl-4">
                      <span className="text-primary/60 font-mono shrink-0">[{c.index}]</span>
                      <div className="space-y-0.5">
                        {pageMatch && <span className="text-muted-foreground/70">Page {pageMatch[1]}</span>}
                        {c.excerpt && (
                          <p className="italic leading-relaxed line-clamp-2">"{c.excerpt}"</p>
                        )}
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[10px]">
                            {c.url}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
  onSheetOpen,
  isLastAssistant,
  steps,
  isStreamingSteps,
  searchSources,
  onFollowUp,
  plan,
  thinkingText,
  fileRefs,
  conversationId,
  inlineData,
  contradictions,
  verifications,
  escalations,
  selfCheckStatus,
  intent,
  planUpdateReason,
  progress,
  onFileClick,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const citations = message.citations || [];
  const followUps = message.followUps || [];

  // Client-side follow-up extraction fallback
  let rawContent = message.content;
  let extractedFollowUps: string[] = [...followUps];
  if (!isUser && !isStreaming && extractedFollowUps.length === 0) {
    const followUpRegex = />>FOLLOWUP:\s*(.+)/g;
    let match;
    while ((match = followUpRegex.exec(rawContent)) !== null) {
      extractedFollowUps.push(match[1].trim());
    }
    const altRegex = /^FOLLOWUP:\s*(.+)/gm;
    while ((match = altRegex.exec(rawContent)) !== null) {
      if (!extractedFollowUps.includes(match[1].trim())) {
        extractedFollowUps.push(match[1].trim());
      }
    }
  }
  // Always strip FOLLOWUP lines from displayed content (with or without >> prefix)
  if (!isUser) {
    rawContent = rawContent.replace(/^>>?FOLLOWUP:\s*.+$/gm, "").replace(/^FOLLOWUP:\s*.+$/gm, "").trim();
  }

  const cleanContent = !isUser ? stripCitationsBlock(rawContent) : rawContent;

  const alreadySelected = nextMessage?.role === "user" ? nextMessage.content : null;

  const questionnaireData = !isUser && !isStreaming && onChoiceSelect
    ? parseMultiStepQuestions(cleanContent)
    : null;

  const choiceData = !isUser && !isStreaming && onChoiceSelect && !questionnaireData
    ? parseChoices(cleanContent)
    : null;

  const isInteractive = isLastAssistant && !alreadySelected;

  const docInfo = !isUser && !isStreaming ? detectDocument(cleanContent) : null;
  const sheetInfo = !isUser && !isStreaming ? detectSheet(cleanContent) : null;

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
      td: wrap("td", "px-3 py-2 border-b border-border text-xs whitespace-normal break-words"),
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

  // Steps section (with reasoning, plan, thinking, file refs, sources)
  const stepsSection = !isUser && (steps?.length || message.reasoning || plan?.length || thinkingText) ? (
    <div className="mb-3">
      <StepTracker
        key={`step-${message.id}`}
        steps={steps || []}
        isStreaming={isStreamingSteps}
        reasoning={message.reasoning}
        searchSources={searchSources}
        plan={plan}
        thinkingText={thinkingText}
        fileRefs={fileRefs}
        inlineData={inlineData || message.frozenInlineData}
        contradictions={contradictions || message.frozenContradictions}
        verifications={verifications || message.frozenVerifications}
        escalations={escalations || message.frozenEscalations}
        selfCheckStatus={selfCheckStatus}
        intent={intent || message.frozenIntent}
        planUpdateReason={planUpdateReason}
        progress={progress}
        citations={citations}
        onFileClick={onFileClick}
      />
    </div>
  ) : null;

  // Always show follow-ups for messages that have them; clickable only when isLastAssistant
  const followUpSection = !isUser && !isStreaming && extractedFollowUps.length > 0 && onFollowUp ? (
    <div className={!isLastAssistant ? "opacity-50 pointer-events-none" : ""}>
      <FollowUpSuggestions suggestions={extractedFollowUps} onSelect={onFollowUp} />
    </div>
  ) : null;

  // Markdown components with remark-gfm for proper tables
  const markdownContent = (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-p:leading-7 prose-strong:text-foreground prose-li:text-foreground/90 prose-li:leading-7 prose-td:text-foreground prose-th:text-foreground prose-a:text-primary prose-code:text-foreground prose-pre:bg-muted prose-pre:border prose-pre:border-border">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/50">{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-border last:border-b-0">{children}</tr>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border text-xs whitespace-normal break-words align-top">
              {citations.length > 0 ? processChildren(children, citations) : children}
            </td>
          ),
          th: ({ children }) => (
            <th className="bg-muted/50 px-3 py-2 text-left font-medium text-foreground border-b border-border text-xs whitespace-nowrap">
              {children}
            </th>
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
  );

  // Render sheet as compact card
  if (sheetInfo && onSheetOpen) {
    return (
      <div className="group">
        <div className="flex items-center gap-2 mb-2">
          <AgentAvatar isUser={false} />
          <span className="text-xs font-semibold text-foreground">LawKit AI</span>
        </div>
        <div className="pl-8 space-y-3">
          {stepsSection}
          <Card
            className="cursor-pointer border-border/60 hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 p-0"
            onClick={() => onSheetOpen(sheetInfo)}
          >
            <div className="flex items-center gap-3 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-3/10">
                <Table2 className="h-4 w-4 text-chart-3" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{sheetInfo.title}</p>
                <p className="text-xs text-muted-foreground">{sheetInfo.columns.length} columns · {sheetInfo.rows.length} rows — Click to open</p>
              </div>
            </div>
          </Card>
          {followUpSection}
          {!isStreaming && cleanContent && (
             <ResponseActions content={cleanContent} messageId={message.id} conversationId={conversationId} onRegenerate={onRegenerate} />
          )}
        </div>
      </div>
    );
  }

  // Render document as compact card
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
            const firstHeadingIdx = cleanContent.search(/^(?:#{1,2}\s+|\*\*\[A-Z])/m);
            const intro = firstHeadingIdx > 0 ? cleanContent.slice(0, firstHeadingIdx).trim() : null;
            return intro ? (
              <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{intro}</ReactMarkdown>
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
          {followUpSection}
          {!isStreaming && cleanContent && (
             <ResponseActions content={cleanContent} messageId={message.id} conversationId={conversationId} onRegenerate={onRegenerate} />
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
          {followUpSection}
          {!isStreaming && cleanContent && (
            <div className="mt-2">
               <ResponseActions content={cleanContent} messageId={message.id} conversationId={conversationId} onRegenerate={onRegenerate} />
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
          {followUpSection}
          {!isStreaming && cleanContent && (
            <div className="mt-2">
              <ResponseActions content={cleanContent} messageId={message.id} conversationId={conversationId} onRegenerate={onRegenerate} />
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

        {/* Final answer divider */}
        {!isUser && stepsSection && cleanContent && (
          <div className="relative my-3">
            <div className="border-t-2 border-agent-divider" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-[10px] text-muted-foreground font-medium tracking-wide">
              LawKit Response
            </span>
          </div>
        )}

        {isUser ? (
          <div>
            <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
            <AttachmentBadges attachments={message.attachments} />
            <UserMessageActions content={message.content} />
          </div>
        ) : (
          markdownContent
        )}

        {isStreaming && !isUser && cleanContent.length > 0 && (
          <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom rounded-full" />
        )}

        {/* Collapsible References */}
        {!isUser && !isStreaming && citations.length > 0 && (
          <CollapsibleReferences citations={citations} onFileClick={onFileClick} />
        )}

        {!isUser && !isStreaming && followUpSection}

        {!isUser && !isStreaming && cleanContent && (
          <ResponseActions
            content={cleanContent}
            messageId={message.id}
            conversationId={conversationId}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}
