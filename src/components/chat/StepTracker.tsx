import { Check, Loader2 } from "lucide-react";
import type { AgentStep } from "@/hooks/useStreamChat";
import { cn } from "@/lib/utils";

interface StepTrackerProps {
  steps: AgentStep[];
  isStreaming: boolean;
}

export function StepTracker({ steps, isStreaming }: StepTrackerProps) {
  if (steps.length === 0) return null;

  const allDone = steps.every((s) => s.status === "done");

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        {allDone ? (
          <Check className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        )}
        <span className="font-medium text-foreground text-xs">
          {allDone ? `Finished in ${steps.length} steps` : "Working..."}
        </span>
      </div>
      <div className="space-y-1 ml-5.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            {step.status === "done" ? (
              <Check className="h-3 w-3 text-primary shrink-0" />
            ) : (
              <Loader2 className="h-3 w-3 text-muted-foreground animate-spin shrink-0" />
            )}
            <span
              className={cn(
                step.status === "done" ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {step.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
