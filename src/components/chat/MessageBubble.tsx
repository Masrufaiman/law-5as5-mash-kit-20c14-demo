import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { FileAttachment } from "./FileAttachment";
import { ResponseActions } from "./ResponseActions";
import { CitationPopover } from "./CitationPopover";
import type { ChatMessage, Citation } from "@/hooks/useStreamChat";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("group", isUser ? "flex justify-end" : "flex justify-start")}>
      <div className={cn("max-w-[85%]", isUser ? "ml-12" : "mr-12")}>
        {/* Avatar + role */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground"
            )}
          >
            {isUser ? "U" : "LK"}
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {isUser ? "You" : "LawKit AI"}
          </span>
          {message.model && !isUser && (
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {message.model.split("/").pop()}
            </span>
          )}
        </div>

        {/* Content */}
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-card border border-border text-foreground"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground prose-li:text-foreground prose-td:text-foreground prose-th:text-foreground">
              <ReactMarkdown
                components={{
                  // Custom citation rendering
                  a: ({ href, children }) => {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {children}
                      </a>
                    );
                  },
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
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {/* Streaming cursor */}
          {isStreaming && !isUser && (
            <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.citations.map((c) => (
              <CitationPopover key={c.index} citation={c} />
            ))}
          </div>
        )}

        {/* Actions for assistant messages */}
        {!isUser && !isStreaming && message.content && (
          <ResponseActions content={message.content} />
        )}
      </div>
    </div>
  );
}
