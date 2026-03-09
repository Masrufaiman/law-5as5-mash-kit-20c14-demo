import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Plus, BookOpen, Zap, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface PromptTemplate {
  id: string;
  label: string;
  prompt: string;
}

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  integrations?: { name: string; provider: string }[];
  deepResearch?: boolean;
  onDeepResearchChange?: (val: boolean) => void;
}

export function ChatInput({ value, onChange, onSend, disabled, deepResearch = false, onDeepResearchChange }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [improving, setImproving] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "agent_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const c = (data.config as any) || {};
          const templates: PromptTemplate[] = [];
          if (c.prompts?.chat) templates.push({ id: "chat", label: "Chat / Research", prompt: c.prompts.chat });
          if (c.prompts?.red_flags) templates.push({ id: "red_flags", label: "Red Flag Detection", prompt: c.prompts.red_flags });
          if (c.prompts?.drafting) templates.push({ id: "drafting", label: "Document Drafting", prompt: c.prompts.drafting });
          setPromptTemplates(templates);
        }
      });
  }, [profile?.organization_id]);

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

        {/* Prompts */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Prompts
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            {promptTemplates.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                No prompt templates configured.
              </p>
            ) : (
              promptTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onChange(t.prompt)}
                  className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="text-left">
                    <p className="font-medium">{t.label}</p>
                    <p className="text-muted-foreground line-clamp-2 mt-0.5">{t.prompt.substring(0, 80)}...</p>
                  </div>
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>

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
            <span className="text-[10px] text-muted-foreground">Deep</span>
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
