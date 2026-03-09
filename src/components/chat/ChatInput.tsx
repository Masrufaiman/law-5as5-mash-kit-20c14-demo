import { useState, useRef } from "react";
import { Paperclip, BookOpen, Sparkles, Globe, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const JURISDICTIONS = [
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "EU", label: "European Union" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "IN", label: "India" },
];

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  integrations?: { name: string; provider: string }[];
}

export function ChatInput({ value, onChange, onSend, disabled, integrations = [] }: ChatInputProps) {
  const [jurisdiction, setJurisdiction] = useState("US");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const selectedJurisdiction = JURISDICTIONS.find((j) => j.code === jurisdiction);

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

        <div className="mx-1 h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
              <Globe className="h-3.5 w-3.5" />
              {selectedJurisdiction?.code}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {JURISDICTIONS.map((j) => (
              <DropdownMenuItem key={j.code} onClick={() => setJurisdiction(j.code)}>
                {j.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

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

      {/* Integration chips */}
      {integrations.length > 0 && (
        <div className="flex gap-1.5 px-3 py-2 border-t border-border flex-wrap">
          {integrations.map((int) => (
            <Badge key={int.name} variant="outline" className="text-[10px] cursor-pointer hover:bg-muted">
              Ask {int.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
