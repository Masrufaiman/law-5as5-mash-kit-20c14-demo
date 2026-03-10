import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Citation } from "@/hooks/useStreamChat";

interface SourcesFooterProps {
  citations: Citation[];
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function SourcesFooter({ citations }: SourcesFooterProps) {
  const [expanded, setExpanded] = useState(false);

  const webSources = citations.filter((c) => c.url);
  const docSources = citations.filter((c) => !c.url);

  if (webSources.length === 0 && docSources.length === 0) return null;

  const totalCited = citations.length;

  // Deduplicate web sources by domain
  const uniqueDomains = new Map<string, Citation>();
  webSources.forEach((c) => {
    const domain = c.url ? getDomain(c.url) : c.source;
    if (!uniqueDomains.has(domain)) uniqueDomains.set(domain, c);
  });
  const uniqueWebSources = Array.from(uniqueDomains.values());

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span>
          Sources{" — "}
          <span className="font-medium text-foreground">{totalCited} cited</span>
        </span>
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 flex flex-wrap gap-2">
          {uniqueWebSources.map((c) => {
            const domain = c.url ? getDomain(c.url) : c.source;
            return (
              <a
                key={c.index}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors"
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                  alt=""
                  className="h-3.5 w-3.5 rounded-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="truncate max-w-[140px]">{domain}</span>
                <ExternalLink className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
              </a>
            );
          })}
          {docSources.map((c) => (
            <span
              key={c.index}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
            >
              <span className="h-3.5 w-3.5 rounded-sm bg-primary/10 flex items-center justify-center text-primary text-[8px] font-bold shrink-0">
                {c.index}
              </span>
              <span className="truncate max-w-[140px]">{c.source}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
