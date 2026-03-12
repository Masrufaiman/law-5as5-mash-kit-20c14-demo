import { FileText, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Citation } from "@/hooks/useStreamChat";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

interface SourcesPanelProps {
  citations: Citation[];
  onClose: () => void;
  onFileClick?: (fileName: string, fileId?: string, excerpt?: string) => void;
}

export function SourcesPanel({ citations, onClose, onFileClick }: SourcesPanelProps) {
  if (citations.length === 0) return null;

  return (
    <div className="w-72 border-l border-border flex flex-col bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Sources</h3>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {citations.map((c) => {
            const isWeb = !!c.url;
            const domain = isWeb ? getDomain(c.url!) : null;
            const displayName = c.title || c.source.replace(/\s*[·\-–—]\s*(chunk|part|section|page)\s*\d+.*/i, "").trim();

            return (
              <div
                key={c.index}
                className="rounded-md border border-border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => {
                  if (isWeb) {
                    window.open(c.url, "_blank", "noopener,noreferrer");
                  } else {
                    onFileClick?.(displayName, undefined, c.excerpt);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                    {c.index}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isWeb ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                          alt=""
                          className="h-3 w-3 rounded-sm shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      <p className="text-xs font-medium text-foreground truncate">
                        {displayName}
                      </p>
                    </div>
                    {isWeb && domain && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{domain}</p>
                    )}
                    {c.excerpt && !isWeb && (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">
                        {c.excerpt}
                      </p>
                    )}
                    {isWeb && (
                      <div className="flex items-center gap-1 mt-1">
                        <ExternalLink className="h-2.5 w-2.5 text-primary" />
                        <span className="text-[10px] text-primary">Open source</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
