import { useState, useEffect, useRef } from "react";
import { Check, Loader2, ChevronDown, ChevronRight, Brain, FileText, Circle, Clock, AlertTriangle, Shield, ArrowUpCircle, Table2, BookOpen, ExternalLink } from "lucide-react";
import type { AgentStep, SearchSource, FileRef, InlineDataTable, Contradiction, Verification, Escalation, IntentData, Citation } from "@/hooks/useStreamChat";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

interface StepTrackerProps {
  steps: AgentStep[];
  isStreaming?: boolean;
  reasoning?: string;
  searchSources?: SearchSource | null;
  plan?: string[];
  thinkingText?: string;
  fileRefs?: FileRef[];
  inlineData?: InlineDataTable[];
  contradictions?: Contradiction[];
  verifications?: Verification[];
  escalations?: Escalation[];
  selfCheckStatus?: string | null;
  intent?: IntentData | null;
  planUpdateReason?: string | null;
  progress?: { current: number; total: number } | null;
  citations?: Citation[];
  onFileClick?: (fileName: string, fileId?: string) => void;
}

function isPlanStepDone(planStep: string, steps: AgentStep[]): boolean {
  const lower = planStep.toLowerCase();
  return steps.some(
    (s) => s.status === "done" && (s.name.toLowerCase().includes(lower.slice(0, 15)) || lower.includes(s.name.toLowerCase().slice(0, 15)))
  );
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function StepTracker({
  steps, isStreaming, reasoning, searchSources, plan, thinkingText, fileRefs,
  inlineData, contradictions, verifications, escalations, selfCheckStatus,
  intent, planUpdateReason, progress, citations, onFileClick,
}: StepTrackerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showAllFileRefs, setShowAllFileRefs] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const hasSteps = steps.length > 0;
  const hasReasoning = !!reasoning?.trim();
  const hasPlan = plan && plan.length > 0;
  const hasThinking = !!thinkingText?.trim();

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "working");
  const isWorking = !allDone || isStreaming;
  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = hasPlan ? plan.length : steps.length;

  const hasAutoCollapsedRef = useRef(false);

  useEffect(() => {
    if (isStreaming) {
      hasAutoCollapsedRef.current = false;
      setCollapsed(false);
      return;
    }
    if (allDone && hasSteps && !hasAutoCollapsedRef.current) {
      const timer = setTimeout(() => {
        setCollapsed(true);
        hasAutoCollapsedRef.current = true;
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [allDone, isStreaming, hasSteps]);

  if (!hasSteps && !hasReasoning && !hasPlan && !hasThinking) return null;

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const visibleFileRefs = fileRefs || [];
  const displayedRefs = showAllFileRefs ? visibleFileRefs : visibleFileRefs.slice(0, 5);

  // Citations for sources section
  const webSources = citations?.filter((c) => c.url) || [];
  const docSources = citations?.filter((c) => !c.url) || [];
  const hasCitations = webSources.length > 0 || docSources.length > 0;
  const totalCited = citations?.length || 0;

  // Deduplicate web sources by domain
  const uniqueDomains = new Map<string, Citation>();
  webSources.forEach((c) => {
    const domain = c.url ? getDomain(c.url) : c.source;
    if (!uniqueDomains.has(domain)) uniqueDomains.set(domain, c);
  });
  const uniqueWebSources = Array.from(uniqueDomains.values());

  // Collapsed summary
  if (collapsed && !isWorking) {
    const stepNames = steps.slice(0, 3).map(s => s.name).join(", ");
    // Sum actual durations from step.duration strings like "72s"
    const totalTime = steps.reduce((sum, s) => {
      if (s.duration) { const num = parseInt(s.duration.replace(/[^\d]/g, '')); return sum + (isNaN(num) ? 0 : num); }
      return sum;
    }, 0);

    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg bg-muted/30 border border-border/40 px-3 py-2 w-full text-left group"
      >
        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="flex-1 truncate">
          Analyzed in {completedCount} step{completedCount !== 1 ? "s" : ""}
          {totalTime > 0 && ` · ${totalTime}s`}
          {hasCitations && ` · ${totalCited} sources`}
          {stepNames && <span className="text-muted-foreground/60 ml-1">— {stepNames}</span>}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          {isWorking ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
          ) : (
            <button onClick={() => setCollapsed(true)} className="shrink-0">
              <Check className="h-3.5 w-3.5 text-primary" />
            </button>
          )}
          <span className="font-medium text-foreground">
            {isWorking
              ? currentStep?.name || (hasReasoning ? "Thinking..." : "Working...")
              : `Completed in ${steps.length} steps`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {progress && isWorking && (
            <span className="text-[10px] font-mono text-agent-blue font-medium">
              {Math.min(progress.current, Math.max(progress.current, progress.total))} / {Math.max(progress.current, progress.total)}
            </span>
          )}
          {!progress && totalSteps > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
              {completedCount} / {totalSteps}
            </Badge>
          )}
          {planUpdateReason && (
            <Badge className="text-[9px] py-0 px-1.5 bg-accent text-accent-foreground border-0">
              Plan updated
            </Badge>
          )}
          {!isWorking && (
            <button onClick={() => setCollapsed(true)} className="text-muted-foreground/40 hover:text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Escalation notices */}
      {escalations && escalations.length > 0 && (
        <div className="space-y-1">
          {escalations.map((esc, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-accent/30 text-accent-foreground animate-in fade-in slide-in-from-left-2">
              <ArrowUpCircle className="h-3 w-3 shrink-0" />
              <span>Upgrading to {esc.to}...</span>
            </div>
          ))}
        </div>
      )}

      {/* Plan checklist */}
      {hasPlan && (
        <div className="space-y-1 ml-1">
          {plan.map((item, i) => {
            const done = (allDone && !isStreaming) || isPlanStepDone(item, steps);
            const isActive = !done && isWorking && i === plan.findIndex(p => !isPlanStepDone(p, steps) || (allDone && isStreaming));
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 text-xs py-0.5 animate-in fade-in slide-in-from-left-1",
                  done ? "text-muted-foreground" : "text-foreground"
                )}
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "both" }}
              >
                {done ? (
                  <Check className="h-3 w-3 text-primary shrink-0" />
                ) : isActive ? (
                  <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                )}
                <span>{item}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-step collapsible blocks */}
      {hasSteps && (
        <div className="space-y-0.5">
          {steps.map((step, i) => {
            const isExpanded = expandedSteps.has(i) || (step.status === "working" && isStreaming);
            const hasDetail = !!step.detail || (step.substeps && step.substeps.length > 0);

            return (
              <div key={i} className="animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}>
                <button
                  onClick={() => hasDetail && toggleStep(i)}
                  className={cn(
                    "flex items-center gap-2 text-xs w-full text-left rounded px-1.5 py-1 transition-colors",
                    step.status === "working" ? "border-l-2 border-agent-blue" : "border-l-2 border-transparent",
                    hasDetail && "hover:bg-muted/50 cursor-pointer",
                    !hasDetail && "cursor-default"
                  )}
                >
                  {step.status === "done" ? (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Check className="h-2.5 w-2.5 text-primary" />
                    </div>
                  ) : (
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <Loader2 className="h-3 w-3 text-primary animate-spin" />
                    </div>
                  )}
                  <span className={cn("flex-1", step.status === "done" ? "text-muted-foreground" : "text-foreground font-medium")}>
                    {step.name}
                  </span>
                  {step.duration && (
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />{step.duration}
                    </span>
                  )}
                  {hasDetail && (isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />)}
                </button>
                {isExpanded && hasDetail && (
                  <div className="ml-7 pl-2 border-l border-border/50 mt-0.5 mb-1 space-y-1">
                    {step.detail && <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{step.detail}</p>}
                    {step.substeps?.map((sub, j) => (
                      <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {sub.status === "done" ? <Check className="h-2.5 w-2.5 text-primary" /> : <Loader2 className="h-2.5 w-2.5 text-primary animate-spin" />}
                        <span>{sub.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Contradiction blocks */}
      {contradictions && contradictions.length > 0 && (
        <div className="space-y-1.5">
          {contradictions.map((c, i) => (
            <Collapsible key={i}>
              <CollapsibleTrigger className="flex items-center gap-1.5 text-[11px] w-full text-left rounded px-2 py-1.5 border-l-2 border-agent-orange bg-agent-orange/5 hover:bg-agent-orange/10 transition-colors cursor-pointer">
                <AlertTriangle className="h-3 w-3 text-agent-orange shrink-0" />
                <span className="text-foreground font-medium flex-1">Conflicting information found</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="ml-4 mt-1 space-y-1 text-[11px] text-muted-foreground pl-2 border-l border-agent-orange/30">
                  <p><strong>Claim:</strong> {c.claim}</p>
                  <p><strong>Source A:</strong> {c.sourceA}</p>
                  <p><strong>Source B:</strong> {c.sourceB}</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      )}

      {/* Verification blocks */}
      {verifications && verifications.length > 0 && (
        <div className="space-y-1">
          {verifications.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded animate-in fade-in">
              {v.status === "checking" ? (
                <>
                  <Loader2 className="h-3 w-3 text-agent-blue animate-spin shrink-0" />
                  <span className="text-muted-foreground">Cross-checking: {v.claim}...</span>
                </>
              ) : v.status === "verified" ? (
                <>
                  <Shield className="h-3 w-3 text-agent-blue shrink-0" />
                  <span className="text-muted-foreground">✓ Verified: {v.claim}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3 text-agent-orange shrink-0" />
                  <span className="text-muted-foreground">⚠ Unverified: {v.claim}</span>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Self-check block */}
      {selfCheckStatus && selfCheckStatus !== "passed" && (
        <div className={cn(
          "flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded border border-dashed",
          selfCheckStatus === "running" ? "border-accent/60 text-muted-foreground" : "border-destructive/40 text-destructive"
        )}>
          {selfCheckStatus === "running" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <span>Reviewing work...</span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>Self-check flagged gaps — researching further...</span>
            </>
          )}
        </div>
      )}

      {/* Search source favicon pills */}
      {searchSources && searchSources.domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-1 ml-1">
          {searchSources.domains.slice(0, 8).map((domain) => (
            <span key={domain} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
              <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" className="h-3 w-3 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <span className="truncate max-w-[100px]">{domain}</span>
            </span>
          ))}
        </div>
      )}

      {/* File reference chips */}
      {visibleFileRefs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-1 ml-1">
          {displayedRefs.map((ref, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="text-[10px] py-0 px-2 gap-1 font-normal cursor-pointer bg-agent-chip text-agent-blue border border-agent-blue/20 hover:bg-agent-blue/10 transition-colors"
              onClick={() => onFileClick?.(ref.name, ref.id)}
            >
              <FileText className="h-2.5 w-2.5" />
              {ref.name}
            </Badge>
          ))}
          {visibleFileRefs.length > 5 && !showAllFileRefs && (
            <button onClick={() => setShowAllFileRefs(true)} className="text-[10px] text-agent-blue hover:underline">
              View {visibleFileRefs.length - 5} more...
            </button>
          )}
        </div>
      )}

      {/* Inline data tables */}
      {inlineData && inlineData.length > 0 && (
        <div className="space-y-2">
          {inlineData.map((table, i) => (
            <div key={i} className="overflow-x-auto rounded-md border border-border animate-in fade-in slide-in-from-bottom-1" style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {table.headers.map((h, j) => (
                      <th key={j} className="bg-agent-blue text-white px-3 py-1.5 text-left font-medium text-[11px] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, ri) => (
                    <tr key={ri} className={ri % 2 === 0 ? "bg-background" : "bg-secondary/30"}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-[11px] text-foreground/80 border-b border-border/30">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Sources section (moved from SourcesFooter) */}
      {hasCitations && !isStreaming && (
        <div className="mt-1">
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>
              Sources{" — "}
              <span className="font-medium text-foreground">{totalCited} cited</span>
            </span>
            {sourcesExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>

          {sourcesExpanded && (
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
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <span className="truncate max-w-[140px]">{domain}</span>
                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                  </a>
                );
              })}
              {docSources.map((c) => {
                const displayName = c.source.replace(/\s*[·\-–—]\s*(chunk|part|section|page)\s*\d+.*/i, "").trim();
                return (
                  <button
                    key={c.index}
                    onClick={() => onFileClick?.(displayName)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate max-w-[140px]">{displayName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Thinking text */}
      {hasThinking && (
        <div className="ml-1 text-[10px] text-muted-foreground/50 leading-relaxed italic border-l border-border/40 pl-2 py-0.5">
          {thinkingText}
        </div>
      )}

      {/* Internal reasoning */}
      {hasReasoning && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground ml-1 cursor-pointer">
            <Brain className="h-2.5 w-2.5" />
            <span>Internal reasoning</span>
            <ChevronDown className="h-2.5 w-2.5" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-1 mt-1 text-[11px] text-muted-foreground/60 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border-l border-border/30 pl-2.5">
              {reasoning}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
