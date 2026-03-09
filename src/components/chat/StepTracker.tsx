import { useState } from "react";
import { Check, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { AgentStep } from "@/hooks/useStreamChat";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface StepTrackerProps {
  steps: AgentStep[];
  isStreaming: boolean;
}

export function StepTracker({ steps, isStreaming }: StepTrackerProps) {
  const [open, setOpen] = useState(true);

  if (steps.length === 0) return null;

  const allDone = steps.every((s) => s.status === "done");
  const currentStep = steps.find((s) => s.status === "working");

  // Auto-collapse when done
  const isOpen = allDone ? open : true;

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs group cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1.5 -ml-2 transition-colors w-full">
        {allDone ? (
          <Check className="h-3 w-3 text-primary shrink-0" />
        ) : (
          <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
        )}
        <span className="font-medium text-muted-foreground">
          {allDone
            ? `Completed in ${steps.length} steps`
            : currentStep
            ? currentStep.name
            : "Working..."}
        </span>
        {allDone && (
          isOpen ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 ml-auto" />
          )
        )}
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-0.5 ml-5 mt-1 border-l border-border pl-3">
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
      </CollapsibleContent>
    </Collapsible>
  );
}
