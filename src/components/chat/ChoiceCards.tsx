import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

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
}

/**
 * Parse numbered choice patterns from markdown text.
 * Supports: "1. **Title** — description" or "1. Title: description"
 * Returns null if the content doesn't look like a choice list.
 */
export function parseChoices(content: string): { preamble: string; choices: Choice[] } | null {
  const lines = content.split("\n");
  const choices: Choice[] = [];
  let preamble = "";
  let choiceStartIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match patterns like: 1. **Title** — desc  OR  1. **Title**: desc  OR  1. Title
    const match = line.match(
      /^(\d+)\.\s+(?:\*\*(.+?)\*\*[\s:—–-]*(.*)|(.*))$/
    );
    if (match) {
      const num = parseInt(match[1]);
      if (match[2]) {
        // Bold title pattern
        choices.push({ number: num, title: match[2].trim(), description: (match[3] || "").trim() });
      } else if (match[4]) {
        // Plain text pattern - split on first colon or dash
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

  // Need at least 2 choices to be considered a choice list
  if (choices.length < 2) return null;

  // Everything before the first choice is preamble
  if (choiceStartIdx > 0) {
    preamble = lines.slice(0, choiceStartIdx).join("\n").trim();
  }

  return { preamble, choices };
}

export function ChoiceCards({ choices, preamble, onSelect, disabled }: ChoiceCardsProps) {
  const [otherText, setOtherText] = useState("");

  return (
    <div className="space-y-3">
      {preamble && (
        <p className="text-sm text-foreground/90 leading-relaxed">{preamble}</p>
      )}

      <div className="grid gap-2">
        {choices.map((choice) => (
          <Card
            key={choice.number}
            className="group cursor-pointer border-border/60 hover:border-primary/40 hover:bg-accent/30 transition-all duration-200 p-0"
            onClick={() => !disabled && onSelect(choice.title)}
          >
            <div className="flex items-start gap-3 p-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                {choice.number}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{choice.title}</p>
                {choice.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {choice.description}
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Other / custom input */}
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
    </div>
  );
}
