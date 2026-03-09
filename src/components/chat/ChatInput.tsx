import { useRef } from "react";
import { Paperclip, BookOpen, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  integrations?: { name: string; provider: string }[];
}

export function ChatInput({ value, onChange, onSend, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask LawKit anything about your documents..."
        className="border-0 focus-visible:ring-0 resize-none min-h-[80px] text-sm bg-transparent"
        rows={3}
        disabled={disabled}
      />

      {/* Bottom toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border bg-muted/30">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
          <Paperclip className="h-3.5 w-3.5" />
          Files
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
          <BookOpen className="h-3.5 w-3.5" />
          Sources
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Improve
        </Button>

        <div className="flex-1" />

        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1.5"
          onClick={onSend}
          disabled={disabled || !value.trim()}
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </Button>
      </div>
    </div>
  );
}
