import { useState, useEffect } from "react";
import { Check, Loader2, ChevronDown, ChevronRight, Brain, FileText, Circle, Clock } from "lucide-react";
import type { AgentStep, SearchSource, FileRef } from "@/hooks/useStreamChat";
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
}

/** Match plan items to completed steps */
function isPlanStepDone(planStep: string, steps: AgentStep[]): boolean {
  const lower = planStep.toLowerCase();
  return steps.some(
    (s) =>
      s.status === "done" &&
      (s.name.toLowerCase().includes(lower.slice(0, 15)) ||
        lower.includes(s.name.toLowerCase().slice(0, 15)))
  );
}

export function StepTracker({
  steps,
  isStreaming,
  reasoning,
  searchSources,
  plan,
  thinkingText,
  fileRefs,
}: StepTrackerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [showAllFileRefs, setShowAllFileRefs] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const hasSteps = steps.length > 0;
  const hasReasoning = !!reasoning?.trim();
  const hasPlan = plan && plan.length > 0;
  const hasThinking = !!thinkingText?.trim();

  if (!hasSteps && !hasReasoning && !hasPlan && !hasThinking) return null;

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "working");
  const isWorking = !allDone || isStreaming;
  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = hasPlan ? plan.length : steps.length;

  // Auto-collapse when done
  useEffect(() => {
    if (allDone && !isStreaming && hasSteps) {
      const timer = setTimeout(() => setCollapsed(true), 800);
      return () => clearTimeout(timer);
    }
    if (isStreaming) {
      setCollapsed(false);
    }
  }, [allDone, isStreaming, hasSteps]);

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const visibleFileRefs = fileRefs || [];
  const displayedRefs = showAllFileRefs ? visibleFileRefs : visibleFileRefs.slice(0, 5);

  // Collapsed summary
  if (collapsed && !isWorking) {
    const stepNames = steps.slice(0, 3).map(s => s.name).join(", ");
    const totalTime = steps.reduce((sum, s) => {
      if (s.duration) {
        const num = parseInt(s.duration);
        return sum + (isNaN(num) ? 0 : num);
      }
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
          {stepNames && <span className="text-muted-foreground/60 ml-1">— {stepNames}</span>}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-2">
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
          {totalSteps > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1.5 font-mono">
              {completedCount} / {totalSteps}
            </Badge>
          )}
          {!isWorking && (
            <button
              onClick={() => setCollapsed(true)}
              className="text-muted-foreground/40 hover:text-muted-foreground"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Plan checklist */}
      {hasPlan && (
        <div className="space-y-1 ml-1">
          {plan.map((item, i) => {
            const done = isPlanStepDone(item, steps);
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
                ) : (
                  <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                )}
                <span className={cn(done && "line-through")}>{item}</span>
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
                  <span className={cn(
                    "flex-1",
                    step.status === "done" ? "text-muted-foreground" : "text-foreground font-medium"
                  )}>
                    {step.name}
                  </span>
                  {step.duration && (
                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {step.duration}
                    </span>
                  )}
                  {hasDetail && (
                    isExpanded
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && hasDetail && (
                  <div className="ml-7 pl-2 border-l border-border/50 mt-0.5 mb-1 space-y-1">
                    {step.detail && (
                      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                        {step.detail}
                      </p>
                    )}
                    {step.substeps?.map((sub, j) => (
                      <div key={j} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {sub.status === "done" ? (
                          <Check className="h-2.5 w-2.5 text-primary" />
                        ) : (
                          <Loader2 className="h-2.5 w-2.5 text-primary animate-spin" />
                        )}
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

      {/* Search source favicon pills */}
      {searchSources && searchSources.domains.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-1 ml-1">
          {searchSources.domains.slice(0, 8).map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                alt=""
                className="h-3 w-3 rounded-sm"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
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
              className="text-[10px] py-0 px-2 gap-1 font-normal cursor-pointer hover:bg-primary/10 transition-colors"
            >
              <FileText className="h-2.5 w-2.5" />
              {ref.name}
            </Badge>
          ))}
          {visibleFileRefs.length > 5 && !showAllFileRefs && (
            <button
              onClick={() => setShowAllFileRefs(true)}
              className="text-[10px] text-primary hover:underline"
            >
              View {visibleFileRefs.length - 5} more...
            </button>
          )}
        </div>
      )}

      {/* Thinking text (visible reasoning between steps) */}
      {hasThinking && (
        <div className="ml-1 text-[11px] text-muted-foreground/70 leading-relaxed italic border-l-2 border-primary/20 pl-2.5 py-1">
          {thinkingText}
        </div>
      )}

      {/* Internal reasoning (from <think> blocks) */}
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
