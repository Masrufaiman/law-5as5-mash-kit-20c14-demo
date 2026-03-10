import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Plus, Zap, Loader2, MessageSquare, FileText, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PROMPT_MODES = [
  { id: "chat", label: "Chat / Research", description: "Ask questions, analyze documents, research topics", icon: MessageSquare },
  { id: "drafting", label: "Draft Document", description: "Generate contracts, memos, briefs, and legal documents", icon: FileText },
  { id: "red_flags", label: "Red Flag Detection", description: "Identify risks, compliance issues, and red flags", icon: AlertTriangle },
];

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  integrations?: { name: string; provider: string }[];
  deepResearch?: boolean;
  onDeepResearchChange?: (val: boolean) => void;
  promptMode?: string;
  onPromptModeChange?: (mode: string | undefined) => void;
}

export function ChatInput({ value, onChange, onSend, disabled, deepResearch = false, onDeepResearchChange, promptMode, onPromptModeChange }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [improving, setImproving] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleImprove = async () => {
    if (!value.trim() || improving) return;
    setImproving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-router`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            conversationId: "",
            message: `Rewrite and improve this legal research prompt to be clearer, more specific, and more effective. Return ONLY the improved prompt, nothing else:\n\n"${value}"`,
            history: [],
          }),
        }
      );

      if (!resp.ok) throw new Error("Failed to improve prompt");

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let improved = "";
      let buffer = "";

      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === "token") improved += parsed.content;
          } catch {}
        }
      }

      if (improved.trim()) {
        let clean = improved.trim();
        if (clean.startsWith('"') && clean.endsWith('"')) clean = clean.slice(1, -1);
        onChange(clean);
        toast({ title: "Prompt improved" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setImproving(false);
    }
  };

  const activeMode = PROMPT_MODES.find((m) => m.id === promptMode) || PROMPT_MODES[0];

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask LawKit anything about your documents..."
        className="border-0 focus-visible:ring-0 resize-none min-h-[80px] text-sm bg-muted/30"
        rows={3}
        disabled={disabled}
      />

      {/* Bottom toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border bg-muted/30">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
          <Plus className="h-3.5 w-3.5" />
          Files
        </Button>

        {/* Mode selector */}
        {onPromptModeChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                <activeMode.icon className="h-3.5 w-3.5" />
                {activeMode.label}
                <ChevronDown className="h-2.5 w-2.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-1.5" align="start">
              {PROMPT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    onPromptModeChange(mode.id === "chat" ? undefined : mode.id);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors",
                    (promptMode === mode.id || (!promptMode && mode.id === "chat")) && "bg-muted ring-1 ring-primary/20"
                  )}
                >
                  <mode.icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{mode.label}</p>
                    <p className="text-muted-foreground mt-0.5">{mode.description}</p>
                  </div>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Improve */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleImprove}
          disabled={!value.trim() || improving || disabled}
        >
          {improving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Improve
        </Button>

        {/* Deep Research toggle */}
        {onDeepResearchChange && (
          <div className="flex items-center gap-1.5 ml-1">
            <Switch
              checked={deepResearch}
              onCheckedChange={onDeepResearchChange}
              className="scale-75"
              disabled={disabled}
            />
            <span className="text-[10px] text-muted-foreground">Deep research</span>
          </div>
        )}

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
