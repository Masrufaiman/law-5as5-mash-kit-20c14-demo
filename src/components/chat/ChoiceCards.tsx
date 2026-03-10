import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface Choice {
  number: number;
  title: string;
  description: string;
}

interface ChoiceCardsProps {
  choices: Choice[];
  preamble?: string;
  onSelect: (text: string) => void;
  disabled?: boolean;
  selectedValue?: string | null;
}

/**
 * Render text with inline badges for backtick-wrapped segments: `badge text`
 */
function renderWithBadges(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  if (parts.length === 1) return text;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {parts.map((part, i) => {
        const badgeMatch = part.match(/^`(.+)`$/);
        if (badgeMatch) {
          return (
            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">
              {badgeMatch[1]}
            </Badge>
          );
        }
        return part ? <span key={i}>{part}</span> : null;
      })}
    </span>
  );
}

/**
 * Detect "insufficient information" / "need more details" patterns.
 */
export function parseNeedMoreInfo(content: string): { preamble: string; choices: Choice[] } | null {
  const needMorePatterns = [
    /don't have sufficient information/i,
    /insufficient information/i,
    /need more (details|context|information|specifics)/i,
    /please (specify|clarify|provide more)/i,
    /could you (specify|clarify|provide|tell me)/i,
    /which (area|topic|type|kind|category)/i,
  ];

  const hasNeedMore = needMorePatterns.some((p) => p.test(content));
  if (!hasNeedMore) return null;

  const lines = content.split("\n");
  const choices: Choice[] = [];
  let preamble = content;

  const defaultChoices = [
    { number: 1, title: "Corporate Law", description: "Business formation, M&A, governance" },
    { number: 2, title: "Contract Law", description: "Agreements, disputes, enforcement" },
    { number: 3, title: "Intellectual Property", description: "Patents, trademarks, copyrights" },
    { number: 4, title: "Employment Law", description: "Labor regulations, compliance, disputes" },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^(\d+)\.\s+(?:\*\*(.+?)\*\*[\s:—–-]*(.*)|(.*))$/);
    if (match) {
      const num = parseInt(match[1]);
      if (match[2]) {
        choices.push({ number: num, title: match[2].trim(), description: (match[3] || "").trim() });
      } else if (match[4]) {
        const plain = match[4].trim();
        const colonIdx = plain.search(/[:\-—–]/);
        if (colonIdx > 0) {
          choices.push({ number: num, title: plain.slice(0, colonIdx).trim(), description: plain.slice(colonIdx + 1).trim() });
        } else {
          choices.push({ number: num, title: plain, description: "" });
        }
      }
    }
  }

  if (choices.length >= 2) {
    const firstChoiceIdx = lines.findIndex((l) => /^\d+\.\s+/.test(l.trim()));
    if (firstChoiceIdx > 0) {
      preamble = lines.slice(0, firstChoiceIdx).join("\n").trim();
    }
    return { preamble, choices };
  }

  return { preamble: content.trim(), choices: defaultChoices };
}

/**
 * Parse numbered choice patterns from markdown text.
 */
export function parseChoices(content: string): { preamble: string; choices: Choice[] } | null {
  const needMore = parseNeedMoreInfo(content);
  if (needMore) return needMore;

  const lines = content.split("\n");
  const choices: Choice[] = [];
  let preamble = "";
  let choiceStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(
      /^(\d+)\.\s+(?:\*\*(.+?)\*\*[\s:—–-]*(.*)|(.*))$/
    );
    if (match) {
      const num = parseInt(match[1]);
      if (match[2]) {
        choices.push({ number: num, title: match[2].trim(), description: (match[3] || "").trim() });
      } else if (match[4]) {
        const plain = match[4].trim();
        const colonIdx = plain.search(/[:\-—–]/);
        if (colonIdx > 0) {
          choices.push({
            number: num,
            title: plain.slice(0, colonIdx).trim(),
            description: plain.slice(colonIdx + 1).trim(),
          });
        } else {
          choices.push({ number: num, title: plain, description: "" });
        }
      }
      if (choiceStartIdx === -1) choiceStartIdx = i;
    }
  }

  if (choices.length < 2) return null;

  const avgTitleLen = choices.reduce((acc, c) => acc + c.title.length, 0) / choices.length;
  if (choices.length > 6 || avgTitleLen > 80) return null;

  // --- False positive guards ---
  const hasMonetaryValues = choices.some(c =>
    /[\$₹€£¥৳]|USD|BDT|INR|EUR|GBP|AED|SGD|\b\d{1,3}(,\d{3})*\.\d{2}\b|\b\d+\s*(BDT|USD|INR|EUR|taka|dollar|rupee)/i.test(c.title + " " + c.description)
  );
  const hasFileExtensions = choices.some(c => /\.\w{2,4}\b/.test(c.title));
  const hasDataPatterns = choices.some(c =>
    /\b(total|amount|sum|balance|invoice|receipt|order|quantity|price|cost|payment|transaction)\b/i.test(c.title + " " + c.description)
  );

  if (choiceStartIdx > 0) {
    preamble = lines.slice(0, choiceStartIdx).join("\n").trim();
  }

  const hasQuestion = /\?\s*$|choose|select|pick|which.*would|which.*prefer|would you like/im.test(preamble);

  if ((hasMonetaryValues || hasFileExtensions || hasDataPatterns) && !hasQuestion) return null;

  return { preamble, choices };
}

export function ChoiceCards({ choices, preamble, onSelect, disabled, selectedValue }: ChoiceCardsProps) {
  const [otherText, setOtherText] = useState("");

  const isSelected = (title: string) =>
    selectedValue && selectedValue.toLowerCase().includes(title.toLowerCase());

  const hasSelection = !!selectedValue;

  return (
    <div className="space-y-3">
      {preamble && (
        <div className="text-sm text-foreground/90 leading-relaxed prose prose-sm max-w-none">
          <ReactMarkdown>{preamble}</ReactMarkdown>
        </div>
      )}

      <div className="grid gap-2">
        {choices.map((choice) => {
          const selected = isSelected(choice.title);
          return (
            <Card
              key={choice.number}
              className={cn(
                "group transition-all duration-200 p-0",
                hasSelection
                  ? selected
                    ? "border-primary/60 bg-primary/5"
                    : "border-border/40 opacity-50"
                  : "cursor-pointer border-border/60 hover:border-primary/40 hover:bg-accent/30",
                (disabled || hasSelection) && "pointer-events-none"
              )}
              onClick={() => !disabled && !hasSelection && onSelect(choice.title)}
            >
              <div className="flex items-start gap-3 p-3">
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/10 text-primary"
                )}>
                  {selected ? <Check className="h-3 w-3" /> : choice.number}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {renderWithBadges(choice.title)}
                  </p>
                  {choice.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {renderWithBadges(choice.description)}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Other / custom input - only show when interactive */}
      {!hasSelection && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="Or type something else..."
            className="h-8 text-xs"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter" && otherText.trim()) {
                onSelect(otherText.trim());
                setOtherText("");
              }
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={disabled || !otherText.trim()}
            onClick={() => {
              if (otherText.trim()) {
                onSelect(otherText.trim());
                setOtherText("");
              }
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
