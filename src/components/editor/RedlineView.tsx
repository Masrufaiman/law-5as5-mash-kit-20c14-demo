import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Check, X, CheckCheck, Shield, ChevronDown, Undo2, ShieldX, ShieldAlert, AlertTriangle, ShieldCheck } from "lucide-react";
import type { RedFlag, RedFlagData } from "@/components/chat/RedFlagCard";

interface RedlineViewProps {
  title: string;
  content: string;
  redFlagData: RedFlagData;
  activeFlagIndex?: number | null;
  onClose: () => void;
  onContentUpdate?: (newContent: string) => void;
}

type FlagStatus = "pending" | "accepted" | "rejected" | "applied";

interface MatchedFlag {
  flag: RedFlag;
  startIdx: number;
  endIdx: number;
  status: FlagStatus;
}

const RISK_COLORS: Record<string, { border: string; bg: string; text: string; highlight: string; borderLeft: string }> = {
  CRITICAL: { border: "border-destructive/50", bg: "bg-destructive/5", text: "text-destructive", highlight: "bg-destructive/10", borderLeft: "border-l-destructive" },
  HIGH: { border: "border-orange-500/50", bg: "bg-orange-500/5", text: "text-orange-600 dark:text-orange-400", highlight: "bg-orange-500/10", borderLeft: "border-l-orange-500" },
  MEDIUM: { border: "border-yellow-500/50", bg: "bg-yellow-500/5", text: "text-yellow-600 dark:text-yellow-400", highlight: "bg-yellow-500/10", borderLeft: "border-l-yellow-500" },
  LOW: { border: "border-border", bg: "bg-muted/30", text: "text-muted-foreground", highlight: "bg-muted/50", borderLeft: "border-l-muted-foreground" },
};

const RISK_ICONS: Record<string, React.ElementType> = {
  CRITICAL: ShieldX,
  HIGH: ShieldAlert,
  MEDIUM: AlertTriangle,
  LOW: ShieldCheck,
};

function fuzzyFind(content: string, clause: string): { start: number; end: number } | null {
  const idx = content.indexOf(clause);
  if (idx !== -1) return { start: idx, end: idx + clause.length };

  const normalizedContent = content.replace(/\s+/g, " ");
  const normalizedClause = clause.replace(/\s+/g, " ");
  const nIdx = normalizedContent.indexOf(normalizedClause);
  if (nIdx !== -1) {
    let origStart = 0, normCount = 0;
    for (let i = 0; i < content.length && normCount < nIdx; i++) {
      if (content[i] === normalizedContent[normCount]) normCount++;
      origStart = i + 1;
    }
    return { start: origStart, end: Math.min(origStart + clause.length + 50, content.length) };
  }

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

export function RedlineView({ title, content, redFlagData, activeFlagIndex, onClose, onContentUpdate }: RedlineViewProps) {
  const [flagStatuses, setFlagStatuses] = useState<Record<number, FlagStatus>>(() => {
    const initial: Record<number, FlagStatus> = {};
    redFlagData.flags.forEach((_, i) => { initial[i] = "pending"; });
    return initial;
  });

  const flagRefs = useRef<Record<number, HTMLSpanElement | null>>({});

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
  const appliedCount = Object.values(flagStatuses).filter(s => s === "applied").length;

  // Scroll to active flag when activeFlagIndex changes
  useEffect(() => {
    if (activeFlagIndex != null && flagRefs.current[activeFlagIndex]) {
      flagRefs.current[activeFlagIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Add pulse animation
      const el = flagRefs.current[activeFlagIndex];
      if (el) {
        el.classList.add("animate-pulse");
        setTimeout(() => el.classList.remove("animate-pulse"), 2000);
      }
    }
  }, [activeFlagIndex]);

  // Auto-transition accepted → applied after animation delay
  useEffect(() => {
    const acceptedKeys = Object.entries(flagStatuses)
      .filter(([, s]) => s === "accepted")
      .map(([k]) => Number(k));
    if (acceptedKeys.length === 0) return;

    const timer = setTimeout(() => {
      setFlagStatuses(prev => {
        const next = { ...prev };
        acceptedKeys.forEach(k => { if (next[k] === "accepted") next[k] = "applied"; });
        return next;
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [flagStatuses]);

  const handleAccept = useCallback((flagIndex: number) => {
    setFlagStatuses(prev => ({ ...prev, [flagIndex]: "accepted" }));
  }, []);

  const handleReject = useCallback((flagIndex: number) => {
    setFlagStatuses(prev => ({ ...prev, [flagIndex]: "rejected" }));
  }, []);

  const handleUndo = useCallback((flagIndex: number) => {
    setFlagStatuses(prev => ({ ...prev, [flagIndex]: "pending" }));
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
    const appliedFlags = matchedFlags
      .map((m) => {
        const origIdx = redFlagData.flags.indexOf(m.flag);
        return { ...m, origIdx };
      })
      .filter(m => flagStatuses[m.origIdx] === "accepted" || flagStatuses[m.origIdx] === "applied")
      .sort((a, b) => b.startIdx - a.startIdx);

    for (const m of appliedFlags) {
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

  // Risk summary counts
  const riskCounts = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    redFlagData.flags.forEach(f => { if (counts[f.risk_level] !== undefined) counts[f.risk_level]++; });
    return counts;
  }, [redFlagData.flags]);

  const totalResolved = acceptedCount + appliedCount + Object.values(flagStatuses).filter(s => s === "rejected").length;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full bg-card border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="h-4 w-4 text-destructive shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
              <p className="text-[10px] text-muted-foreground">
                {redFlagData.flags.length} flags · {totalResolved} resolved · {pendingCount} pending
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
            {(acceptedCount > 0 || appliedCount > 0) && (
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

        {/* Risk Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/20">
          {(Object.entries(riskCounts) as [string, number][]).filter(([, c]) => c > 0).map(([level, count]) => {
            const Icon = RISK_ICONS[level] || ShieldCheck;
            const colors = RISK_COLORS[level] || RISK_COLORS.LOW;
            return (
              <Badge key={level} variant="outline" className={cn("text-[10px] gap-1 py-0.5 px-2 font-semibold", colors.text, colors.border, colors.bg)}>
                <Icon className="h-3 w-3" />
                {count} {level.charAt(0) + level.slice(1).toLowerCase()}
              </Badge>
            );
          })}
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

                // Applied — show only the new text with a subtle green tint + hover undo
                if (status === "applied") {
                  return (
                    <span
                      key={i}
                      ref={(el) => { flagRefs.current[origIdx] = el; }}
                      className="relative group/applied"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-foreground bg-green-500/10 border-b border-green-500/30 transition-colors">
                            {flag.flag.suggested_edit}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">
                          <p className="text-muted-foreground line-through mb-1">{seg.content}</p>
                          <p className="text-foreground">Replaced with suggested edit</p>
                        </TooltipContent>
                      </Tooltip>
                      <button
                        onClick={() => handleUndo(origIdx)}
                        className="hidden group-hover/applied:inline-flex items-center ml-0.5 text-muted-foreground hover:text-foreground align-middle"
                        title="Undo"
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
                    </span>
                  );
                }

                // Accepted — show strikethrough + green new text (transitioning to applied)
                if (status === "accepted") {
                  return (
                    <span
                      key={i}
                      ref={(el) => { flagRefs.current[origIdx] = el; }}
                      className="relative transition-all duration-500"
                    >
                      <span className="line-through text-destructive/60 bg-destructive/5">{seg.content}</span>
                      <span className="text-green-700 dark:text-green-400 bg-green-500/10 not-italic ml-1">{flag.flag.suggested_edit}</span>
                      <button
                        onClick={() => handleUndo(origIdx)}
                        className="inline-flex items-center ml-1 text-muted-foreground hover:text-foreground align-middle"
                        title="Undo"
                      >
                        <Undo2 className="h-3 w-3" />
                      </button>
                    </span>
                  );
                }

                // Pending — highlighted clause with accept/reject controls
                return (
                  <Tooltip key={i}>
                    <TooltipTrigger asChild>
                      <span
                        ref={(el) => { flagRefs.current[origIdx] = el; }}
                        className={cn(
                          "relative inline border-l-[3px] pl-1 py-0.5 transition-all",
                          colors.highlight,
                          colors.borderLeft,
                          activeFlagIndex === origIdx && "ring-2 ring-primary/30 rounded-sm"
                        )}
                      >
                        {seg.content}
                        <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                          <Badge variant="outline" className={cn("text-[9px] py-0 px-1 font-semibold", colors.text, colors.border)}>
                            {flag.flag.risk_level}
                          </Badge>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAccept(origIdx); }}
                            className="inline-flex items-center justify-center h-4 w-4 rounded bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 transition-colors"
                            title="Accept suggested edit"
                          >
                            <Check className="h-2.5 w-2.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReject(origIdx); }}
                            className="inline-flex items-center justify-center h-4 w-4 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            title="Dismiss flag"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-sm p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">{flag.flag.reason}</p>
                      <div className="border-t border-border pt-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Suggested Edit</p>
                        <p className="text-xs text-foreground/80 italic">{flag.flag.suggested_edit}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
