import { Sparkles } from "lucide-react";

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

export function FollowUpSuggestions({ suggestions, onSelect }: FollowUpSuggestionsProps) {
  if (!suggestions.length) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium flex items-center gap-1">
        <Sparkles className="h-3 w-3" />
        Follow-up questions
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:bg-accent/50 hover:border-primary/30 transition-colors text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
