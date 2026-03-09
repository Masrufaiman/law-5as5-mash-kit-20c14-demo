import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ResponseActions } from "./ResponseActions";
import { CitationPopover } from "./CitationPopover";
import type { ChatMessage } from "@/hooks/useStreamChat";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

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
        {message.model && !isUser && (
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {message.model.split("/").pop()}
          </span>
        )}
      </div>

      {/* Content — no background, clean prose */}
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
                th: ({ children }) => (
                  <th className="bg-muted/50 px-3 py-2 text-left font-medium text-foreground border-b border-border text-xs">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 border-b border-border text-xs">
                    {children}
                  </td>
                ),
                h1: ({ children }) => (
                  <h1 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-base font-semibold text-foreground mt-3 mb-1.5">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 space-y-0.5 my-2">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 space-y-0.5 my-2">{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-primary/30 pl-3 my-2 text-muted-foreground italic">
                    {children}
                  </blockquote>
                ),
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

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {message.citations.map((c) => (
              <CitationPopover key={c.index} citation={c} />
            ))}
          </div>
        )}

        {/* Actions for assistant messages — always visible */}
        {!isUser && !isStreaming && message.content && (
          <ResponseActions content={message.content} />
        )}
      </div>
    </div>
  );
}
