import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Plus, Loader2, MessageSquare, FileText, AlertTriangle, ChevronDown, FolderOpen, Scale, Table2, Zap, Reply, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PROMPT_MODES = [
  { id: "chat", label: "Chat / Research", description: "Ask questions, analyze documents, research topics", icon: MessageSquare },
  { id: "drafting", label: "Draft Document", description: "Generate contracts, memos, briefs, and legal documents", icon: FileText },
  { id: "red_flags", label: "Red Flag Detection", description: "Identify risks, compliance issues, and red flags", icon: AlertTriangle },
  { id: "review", label: "Review Table", description: "Extract structured data from documents into a spreadsheet", icon: Table2 },
];

const JURISDICTION_SOURCES = [
  { name: "Web Search", icon: Scale },
  { name: "EDGAR (SEC)", icon: Scale },
  { name: "CourtListener", icon: Scale },
  { name: "EUR-Lex", icon: Scale },
  { name: "US Law", icon: Scale },
  { name: "UK Law", icon: Scale },
  { name: "Indian Law", icon: Scale },
  { name: "Canadian Law", icon: Scale },
  { name: "Australian Law", icon: Scale },
  { name: "French Law", icon: Scale },
  { name: "German Law", icon: Scale },
  { name: "Brazilian Law", icon: Scale },
  { name: "Singapore Law", icon: Scale },
  { name: "UAE Law", icon: Scale },
  { name: "Italian Law", icon: Scale },
  { name: "Japanese Law", icon: Scale },
  { name: "South Korean Law", icon: Scale },
  { name: "Chinese Law", icon: Scale },
  { name: "Spanish Law", icon: Scale },
  { name: "Swiss Law", icon: Scale },
];

interface VaultItem {
  id: string;
  name: string;
}

export interface WorkflowTag {
  title: string;
  systemPrompt?: string;
}

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
  vaults?: VaultItem[];
  selectedVault?: VaultItem | null;
  onVaultSelect?: (vault: VaultItem | null) => void;
  activeSources?: string[];
  onSourceToggle?: (source: string) => void;
  workflowTag?: WorkflowTag | null;
  onWorkflowTagRemove?: () => void;
  replyContext?: string | null;
  onRemoveReply?: () => void;
  onFilesAttach?: (files: File[]) => void;
  isProcessingFiles?: boolean;
}

export function ChatInput({
  value, onChange, onSend, disabled, deepResearch = false, onDeepResearchChange,
  promptMode, onPromptModeChange, vaults, selectedVault, onVaultSelect, activeSources, onSourceToggle,
  workflowTag, onWorkflowTagRemove, replyContext, onRemoveReply,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [improving, setImproving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [localVaults, setLocalVaults] = useState<VaultItem[]>([]);

  useEffect(() => {
    if (vaults) return;
    if (!profile?.organization_id) return;
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setLocalVaults(data || []));
  }, [profile?.organization_id, vaults]);

  const effectiveVaults = vaults || localVaults;

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

  const filteredJurisdictions = searchFilter
    ? JURISDICTION_SOURCES.filter(j => j.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : JURISDICTION_SOURCES;

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Workflow tag badge */}
      {workflowTag && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2">
          <Badge
            variant="secondary"
            className="text-[10px] py-0 px-1.5 gap-1 font-normal cursor-pointer hover:bg-destructive/20"
            onClick={onWorkflowTagRemove}
          >
            <Zap className="h-2.5 w-2.5" />
            {workflowTag.title}
            <span className="ml-0.5 text-muted-foreground">×</span>
          </Badge>
        </div>
      )}

      {/* Reply context badge */}
      {replyContext && (
        <div className="flex items-start gap-2 px-3 pt-2">
          <div className="flex-1 flex items-start gap-2 rounded-md bg-muted/50 border border-border/50 px-2.5 py-1.5">
            <Reply className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">
              {replyContext.length > 120 ? replyContext.slice(0, 120) + "..." : replyContext}
            </p>
            <button
              onClick={onRemoveReply}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask LawKit anything..."
          className="border-0 focus-visible:ring-0 resize-none min-h-[80px] text-sm bg-muted/30"
          rows={3}
          disabled={disabled}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border bg-muted/30">
        {/* Sources button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
              Sources
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
            <ScrollArea className="max-h-[350px]">
              <div className="p-2">
                {effectiveVaults.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                      Vaults
                    </p>
                    {effectiveVaults.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => onVaultSelect?.(selectedVault?.id === v.id ? null : v)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          {v.name}
                        </span>
                        {selectedVault?.id === v.id && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </button>
                    ))}
                    <div className="my-1 h-px bg-border" />
                  </>
                )}

                <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                  Jurisdictions & Databases
                </p>
                <div className="px-2.5 py-1">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter..."
                    className="w-full h-7 px-2 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {filteredJurisdictions.map((j) => (
                  <button
                    key={j.name}
                    onClick={() => onSourceToggle?.(j.name)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <j.icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {j.name}
                    </span>
                    {activeSources?.includes(j.name) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

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
