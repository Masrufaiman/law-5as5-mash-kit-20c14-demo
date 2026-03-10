import { useState } from "react";
import { Check, Loader2, ChevronDown, ChevronRight, Brain } from "lucide-react";
import type { AgentStep, SearchSource } from "@/hooks/useStreamChat";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface StepTrackerProps {
  steps: AgentStep[];
  isStreaming?: boolean;
  reasoning?: string;
  searchSources?: SearchSource | null;
}

export function StepTracker({ steps, isStreaming, reasoning, searchSources }: StepTrackerProps) {
  const [open, setOpen] = useState(false);

  const hasSteps = steps.length > 0;
  const hasReasoning = !!reasoning?.trim();

  if (!hasSteps && !hasReasoning) return null;

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "working");
  const isWorking = !allDone || isStreaming;

  const isOpen = isWorking ? true : open;

  const label = isWorking
    ? currentStep?.name || (hasReasoning ? "Thinking..." : "Working...")
    : `Completed in ${steps.length} steps`;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs group cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 -ml-2 transition-colors w-full">
        {isWorking ? (
          hasReasoning && !hasSteps ? (
            <Brain className="h-3 w-3 text-primary animate-pulse shrink-0" />
          ) : (
            <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
          )
        ) : (
          <Check className="h-3 w-3 text-primary shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">{label}</span>
        {!isWorking && (
          isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 ml-auto" />
          )
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-2 mt-1 pl-3 space-y-0.5">
          {/* Steps list with vertical line */}
          {hasSteps && (
            <div className="relative">
              {/* Vertical connector line */}
              <div className="absolute left-[4px] top-1 bottom-1 w-px bg-border" />
              <div className="space-y-0">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-2.5 text-xs py-1 pl-0 animate-in fade-in slide-in-from-left-2 relative",
                      step.status === "done"
                        ? "text-muted-foreground"
                        : "text-foreground"
                    )}
                    style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                  >
                    {step.status === "done" ? (
                      <div className="relative z-10 flex h-[9px] w-[9px] shrink-0 mt-[3px] items-center justify-center rounded-full bg-primary/20">
                        <Check className="h-2 w-2 text-primary" />
                      </div>
                    ) : (
                      <div className="relative z-10 flex h-[9px] w-[9px] shrink-0 mt-[3px]">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-primary/40 animate-ping" />
                        <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-primary" />
                      </div>
                    )}
                    <span className="leading-tight">{step.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search source favicon pills */}
          {searchSources && searchSources.domains.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1.5 ml-4">
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

          {/* Reasoning/thinking text */}
          {hasReasoning && (
            <div className="ml-4 text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap py-1 max-h-48 overflow-y-auto border-l border-border/50 pl-3">
              {reasoning}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
