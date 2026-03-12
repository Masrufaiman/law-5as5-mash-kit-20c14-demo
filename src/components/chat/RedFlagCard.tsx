import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { AlertTriangle, ChevronDown, ChevronRight, FileText, Shield, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";

export interface RedFlag {
  clause_text: string;
  risk_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: string;
  reason: string;
  suggested_edit: string;
}

export interface RedFlagSummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  risk_score: number;
}

export interface RedFlagData {
  title: string;
  flags: RedFlag[];
  summary: RedFlagSummary;
}

const RISK_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  CRITICAL: { icon: ShieldX, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", label: "Critical" },
  HIGH: { icon: ShieldAlert, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", label: "High" },
  MEDIUM: { icon: AlertTriangle, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Medium" },
  LOW: { icon: ShieldCheck, color: "text-muted-foreground", bg: "bg-muted/50", border: "border-border", label: "Low" },
};

function RiskBadge({ level }: { level: string }) {
  const config = RISK_CONFIG[level] || RISK_CONFIG.LOW;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 py-0 px-1.5 font-semibold", config.color, config.border, config.bg)}>
      <Icon className="h-2.5 w-2.5" />
      {config.label}
    </Badge>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal capitalize">
      {category.replace(/_/g, " ")}
    </Badge>
  );
}

function FlagItem({ flag }: { flag: RedFlag }) {
  const [open, setOpen] = useState(false);
  const config = RISK_CONFIG[flag.risk_level] || RISK_CONFIG.LOW;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className={cn(
        "flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent/30 cursor-pointer",
        config.border
      )}>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <RiskBadge level={flag.risk_level} />
            <CategoryBadge category={flag.category} />
            {open ? <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />}
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2">{flag.reason}</p>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={cn("mx-0.5 mt-1 mb-2 rounded-b-lg border-x border-b p-3 space-y-3", config.border)}>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Clause Text</p>
            <blockquote className="text-xs text-foreground/80 italic border-l-2 border-primary/30 pl-2 leading-relaxed">
              "{flag.clause_text}"
            </blockquote>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Suggested Edit</p>
            <p className="text-xs text-foreground/90 leading-relaxed bg-accent/20 rounded p-2">
              {flag.suggested_edit}
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function RedFlagCard({ data, onOpenInEditor }: { data: RedFlagData; onOpenInEditor?: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const { summary, flags } = data;

  // Group flags by category
  const grouped = flags.reduce<Record<string, RedFlag[]>>((acc, f) => {
    const cat = f.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  const cappedScore = Math.min(summary.risk_score, 10);
  const riskColor = cappedScore >= 7 ? "text-destructive" : cappedScore >= 4 ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400";

  return (
    <Card className="border-border/60 overflow-hidden">
      {/* Summary Header */}
      <div className="p-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <Shield className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{data.title}</p>
              <p className="text-[10px] text-muted-foreground">{summary.total} flags identified</p>
            </div>
          </div>
          <div className={cn("text-lg font-bold", riskColor)}>
            {Math.min(summary.risk_score, 10)}/10
          </div>
        </div>

        {/* Risk level counts */}
        <div className="flex items-center gap-3 text-[10px]">
          {summary.critical > 0 && (
            <span className="flex items-center gap-1 text-destructive font-semibold">
              <ShieldX className="h-3 w-3" /> {summary.critical} Critical
            </span>
          )}
          {summary.high > 0 && (
            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium">
              <ShieldAlert className="h-3 w-3" /> {summary.high} High
            </span>
          )}
          {summary.medium > 0 && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-medium">
              <AlertTriangle className="h-3 w-3" /> {summary.medium} Medium
            </span>
          )}
          {summary.low > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> {summary.low} Low
            </span>
          )}
        </div>
      </div>

      {/* Flags */}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? "Hide details" : "Show all flags"}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-4">
            {Object.entries(grouped).map(([category, catFlags]) => (
              <div key={category}>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 capitalize">
                  {category.replace(/_/g, " ")}
                </p>
                <div className="space-y-2">
                  {catFlags.map((flag, i) => (
                    <FlagItem key={`${category}-${i}`} flag={flag} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Footer */}
      {onOpenInEditor && (
        <div className="px-3 py-2 border-t border-border bg-muted/20">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={onOpenInEditor}>
            <FileText className="h-3 w-3" />
            Open in Editor
          </Button>
        </div>
      )}
    </Card>
  );
}

export function parseRedFlags(content: string): RedFlagData | null {
  const match = content.match(/<!--\s*REDFLAGS:\s*(.+?)\s*-->\s*```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[2]);
    return {
      title: match[1].trim(),
      flags: parsed.flags || [],
      summary: parsed.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0, risk_score: 0 },
    };
  } catch {
    return null;
  }
}
