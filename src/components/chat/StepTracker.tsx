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

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function StepTracker({ steps, isStreaming, reasoning, searchSources }: StepTrackerProps) {
  const [open, setOpen] = useState(false);

  const hasSteps = steps.length > 0;
  const hasReasoning = !!reasoning?.trim();

  if (!hasSteps && !hasReasoning) return null;

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "working");
  const isWorking = !allDone || isStreaming;

  // Auto-expand while working, collapse when done (user can toggle)
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
        <div className="ml-5 mt-1 border-l border-border pl-3 space-y-1">
          {/* Steps list */}
          {hasSteps && (
            <div className="space-y-0.5">
              {steps.map((step, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 text-xs py-0.5 animate-in fade-in slide-in-from-left-2",
                    step.status === "done"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  )}
                  style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
                >
                  {step.status === "done" ? (
                    <Check className="h-2.5 w-2.5 text-primary shrink-0" />
                  ) : (
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary/40 animate-ping" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                  )}
                  <span>{step.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Search source favicon pills */}
          {searchSources && searchSources.domains.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1.5">
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
            <div className="text-xs text-muted-foreground/80 leading-relaxed whitespace-pre-wrap py-1 max-h-48 overflow-y-auto">
              {reasoning}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
