import React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ResponseActions } from "./ResponseActions";
import { CitationPopover } from "./CitationPopover";
import type { ChatMessage, Citation } from "@/hooks/useStreamChat";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onRegenerate?: () => void;
}

/**
 * Recursively process React children to replace [N] patterns with CitationPopover components.
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

function injectCitations(text: string, citations: Citation[]): React.ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  if (parts.length === 1) return [text];

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const citation = citations.find((c) => c.index === idx);
      if (citation) {
        return <CitationPopover key={`cite-${idx}-${i}`} citation={citation} />;
      }
    }
    return part;
  });
}

/** Wrap a markdown component to inject inline citations into its text children */
function withCitations<P extends { children?: React.ReactNode }>(
  Component: React.FC<P> | string,
  citations: Citation[]
) {
  return function CitationWrapper(props: P) {
    const processed = processChildren(props.children, citations);
    if (typeof Component === "string") {
      return React.createElement(Component, { ...props, children: undefined } as any, processed);
    }
    return <Component {...props}>{processed}</Component>;
  };
}

export function MessageBubble({ message, isStreaming, onRegenerate }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const citations = message.citations || [];

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

  return (
    <div className="group">
      {/* Avatar + role header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isUser ? "U" : "LK"}
        </div>
        <span className="text-xs font-semibold text-foreground">
          {isUser ? "You" : "LawKit AI"}
        </span>
      </div>

      {/* Content */}
      <div className="pl-8">
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
                // Override text-containing elements with citation injection
                ...citeComponents,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Streaming cursor */}
        {isStreaming && !isUser && (
          <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom rounded-full" />
        )}

        {/* Actions for assistant messages */}
        {!isUser && !isStreaming && message.content && (
          <ResponseActions
            content={message.content}
            messageId={message.id}
            onRegenerate={onRegenerate}
          />
        )}
      </div>
    </div>
  );
}
