import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Check, X, CheckCheck, Shield, ChevronDown } from "lucide-react";
import type { RedFlag, RedFlagData } from "@/components/chat/RedFlagCard";

interface RedlineViewProps {
  title: string;
  content: string;
  redFlagData: RedFlagData;
  onClose: () => void;
  onContentUpdate?: (newContent: string) => void;
}

type FlagStatus = "pending" | "accepted" | "rejected";

interface MatchedFlag {
  flag: RedFlag;
  startIdx: number;
  endIdx: number;
  status: FlagStatus;
}

const RISK_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  CRITICAL: { border: "border-destructive/50", bg: "bg-destructive/5", text: "text-destructive" },
  HIGH: { border: "border-orange-500/50", bg: "bg-orange-500/5", text: "text-orange-600 dark:text-orange-400" },
  MEDIUM: { border: "border-yellow-500/50", bg: "bg-yellow-500/5", text: "text-yellow-600 dark:text-yellow-400" },
  LOW: { border: "border-border", bg: "bg-muted/30", text: "text-muted-foreground" },
};

function fuzzyFind(content: string, clause: string): { start: number; end: number } | null {
  // Try exact match first
  const idx = content.indexOf(clause);
  if (idx !== -1) return { start: idx, end: idx + clause.length };

  // Try normalized match (collapse whitespace)
  const normalizedContent = content.replace(/\s+/g, " ");
  const normalizedClause = clause.replace(/\s+/g, " ");
  const nIdx = normalizedContent.indexOf(normalizedClause);
  if (nIdx !== -1) {
    // Map back to original positions
    let origStart = 0, normCount = 0;
    for (let i = 0; i < content.length && normCount < nIdx; i++) {
      if (content[i] === normalizedContent[normCount]) normCount++;
      origStart = i + 1;
    }
    return { start: origStart, end: Math.min(origStart + clause.length + 50, content.length) };
  }

  // Try first 60 chars as substring
  const snippet = normalizedClause.substring(0, 60);
  const sIdx = normalizedContent.indexOf(snippet);
  if (sIdx !== -1) {
    let origStart = 0, normCount = 0;
    for (let i = 0; i < content.length && normCount < sIdx; i++) {
      if (content[i] === normalizedContent[normCount]) normCount++;
      origStart = i + 1;
    }
    return { start: origStart, end: Math.min(origStart + clause.length + 50, content.length) };
  }

  return null;
}

export function RedlineView({ title, content, redFlagData, onClose, onContentUpdate }: RedlineViewProps) {
  const [flagStatuses, setFlagStatuses] = useState<Record<number, FlagStatus>>(() => {
    const initial: Record<number, FlagStatus> = {};
    redFlagData.flags.forEach((_, i) => { initial[i] = "pending"; });
    return initial;
  });

  const matchedFlags = useMemo<MatchedFlag[]>(() => {
    return redFlagData.flags.map((flag, i) => {
      const match = fuzzyFind(content, flag.clause_text);
      return {
        flag,
        startIdx: match?.start ?? -1,
        endIdx: match?.end ?? -1,
        status: flagStatuses[i] || "pending",
      };
    }).filter(m => m.startIdx >= 0).sort((a, b) => a.startIdx - b.startIdx);
  }, [content, redFlagData.flags, flagStatuses]);

  const pendingCount = Object.values(flagStatuses).filter(s => s === "pending").length;
  const acceptedCount = Object.values(flagStatuses).filter(s => s === "accepted").length;

  const handleAccept = useCallback((flagIndex: number) => {
    setFlagStatuses(prev => ({ ...prev, [flagIndex]: "accepted" }));
  }, []);

  const handleReject = useCallback((flagIndex: number) => {
    setFlagStatuses(prev => ({ ...prev, [flagIndex]: "rejected" }));
  }, []);

  const handleAcceptAll = useCallback(() => {
    setFlagStatuses(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (next[Number(k)] === "pending") next[Number(k)] = "accepted"; });
      return next;
    });
  }, []);

  const applyChanges = useCallback(() => {
    let newContent = content;
    // Apply accepted changes in reverse order to preserve indices
    const acceptedFlags = matchedFlags
      .map((m, _) => {
        const origIdx = redFlagData.flags.indexOf(m.flag);
        return { ...m, origIdx };
      })
      .filter(m => flagStatuses[m.origIdx] === "accepted")
      .sort((a, b) => b.startIdx - a.startIdx);

    for (const m of acceptedFlags) {
      newContent = newContent.substring(0, m.startIdx) + m.flag.suggested_edit + newContent.substring(m.endIdx);
    }

    onContentUpdate?.(newContent);
  }, [content, matchedFlags, flagStatuses, redFlagData.flags, onContentUpdate]);

  // Build segments for rendering
  const segments = useMemo(() => {
    const segs: { type: "text" | "flag"; content: string; flag?: MatchedFlag; flagIndex?: number }[] = [];
    let lastEnd = 0;

    for (const mf of matchedFlags) {
      if (mf.startIdx > lastEnd) {
        segs.push({ type: "text", content: content.substring(lastEnd, mf.startIdx) });
      }
      const origIdx = redFlagData.flags.indexOf(mf.flag);
      segs.push({ type: "flag", content: content.substring(mf.startIdx, mf.endIdx), flag: mf, flagIndex: origIdx });
      lastEnd = mf.endIdx;
    }

    if (lastEnd < content.length) {
      segs.push({ type: "text", content: content.substring(lastEnd) });
    }

    return segs;
  }, [content, matchedFlags, redFlagData.flags]);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="h-4 w-4 text-destructive shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
            <p className="text-[10px] text-muted-foreground">
              {redFlagData.flags.length} flags · {pendingCount} pending · {acceptedCount} accepted
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingCount > 0 && (
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleAcceptAll}>
              <CheckCheck className="h-3 w-3" />
              Accept All ({pendingCount})
            </Button>
          )}
          {acceptedCount > 0 && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={applyChanges}>
              <Check className="h-3 w-3" />
              Apply Changes
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Document with redlines */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-none">
          <div className="prose prose-sm max-w-none text-foreground/90 leading-relaxed whitespace-pre-wrap font-serif text-[13px]">
            {segments.map((seg, i) => {
              if (seg.type === "text") {
                return <span key={i}>{seg.content}</span>;
              }

              const flag = seg.flag!;
              const origIdx = seg.flagIndex!;
              const status = flagStatuses[origIdx];
              const colors = RISK_COLORS[flag.flag.risk_level] || RISK_COLORS.LOW;

              if (status === "rejected") {
                return <span key={i}>{seg.content}</span>;
              }

              if (status === "accepted") {
                return (
                  <span key={i} className="relative">
                    <span className="line-through text-destructive/60 bg-destructive/5">{seg.content}</span>
                    <span className="text-green-700 dark:text-green-400 bg-green-500/10 not-italic ml-1">{flag.flag.suggested_edit}</span>
                    <button
                      onClick={() => handleReject(origIdx)}
                      className="inline-flex items-center ml-1 text-muted-foreground hover:text-foreground"
                      title="Undo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              }

              // Pending
              return (
                <span key={i} className="relative inline">
                  <span className={cn("border-b-2 py-0.5", colors.border, colors.bg)}>
                    {seg.content}
                  </span>
                  <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                    <Badge variant="outline" className={cn("text-[9px] py-0 px-1 font-semibold", colors.text, colors.border)}>
                      {flag.flag.risk_level}
                    </Badge>
                    <button
                      onClick={() => handleAccept(origIdx)}
                      className="inline-flex items-center justify-center h-4 w-4 rounded bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                      title="Accept suggested edit"
                    >
                      <Check className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => handleReject(origIdx)}
                      className="inline-flex items-center justify-center h-4 w-4 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                      title="Dismiss flag"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                  {/* Tooltip with reason + suggestion on hover */}
                  <div className="hidden group-hover:block absolute z-10 left-0 top-full mt-1 w-80 p-2 bg-popover border border-border rounded-md shadow-md text-xs">
                    <p className="font-medium text-foreground mb-1">{flag.flag.reason}</p>
                    <p className="text-muted-foreground italic">Suggestion: {flag.flag.suggested_edit}</p>
                  </div>
                </span>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
