import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { FileText, ExternalLink, Globe } from "lucide-react";
import type { Citation } from "@/hooks/useStreamChat";

interface CitationPopoverProps {
  citation: Citation;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function CitationPopover({ citation, onFileClick }: CitationPopoverProps & { onFileClick?: (fileName: string, fileId?: string, excerpt?: string) => void }) {
  const domain = citation.url ? getDomain(citation.url) : null;
  const hasNoLink = !citation.url && !onFileClick;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-colors"
          onClick={() => {
            if (citation.url) {
              window.open(citation.url, "_blank", "noopener,noreferrer");
            } else if (onFileClick) {
              const displayName = citation.source.replace(/\s*[·\-–—]\s*(chunk|part|section|page)\s*\d+.*/i, "").trim();
              onFileClick(displayName, undefined, citation.excerpt);
            }
            // If no URL and no file click handler, do nothing (no dead click)
          }}
        >
          {citation.index}
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-3" align="start" side="top">
        <div className="flex items-start gap-2">
          {citation.url ? (
            <img
              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
              alt=""
              className="h-4 w-4 rounded shrink-0 mt-0.5"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <FileText className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground truncate">
              {citation.source.replace(/\s*[·\-–—]\s*(chunk|part|section|page)\s*\d+.*/i, "").trim()}
            </p>
            {domain && (
              <p className="text-[10px] text-muted-foreground truncate">{domain}</p>
            )}
            {citation.excerpt && !citation.url && (
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                {citation.excerpt}
              </p>
            )}
            {citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-1"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                Open source
              </a>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
