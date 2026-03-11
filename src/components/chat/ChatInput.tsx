import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Plus, Loader2, MessageSquare, FileText, AlertTriangle, ChevronDown, FolderOpen, Scale, Table2, Zap, Reply, X, Upload, BookOpen, Globe } from "lucide-react";
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
  { name: "Web Search", icon: Globe },
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

interface KBSource {
  id: string;
  title: string;
  category: string | null;
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
  // File handling
  attachedFiles?: File[];
  onFileSelect?: () => void;
  onRemoveFile?: (index: number) => void;
  isProcessingFiles?: boolean;
  onFilesDropped?: (files: File[]) => void;
  // Knowledge base
  kbSources?: KBSource[];
}

export function ChatInput({
  value, onChange, onSend, disabled, deepResearch = false, onDeepResearchChange,
  promptMode, onPromptModeChange, vaults, selectedVault, onVaultSelect, activeSources, onSourceToggle,
  workflowTag, onWorkflowTagRemove, replyContext, onRemoveReply,
  attachedFiles, onFileSelect, onRemoveFile, isProcessingFiles, kbSources, onFilesDropped,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();
  const { toast } = useToast();
  const [improving, setImproving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [localVaults, setLocalVaults] = useState<VaultItem[]>([]);
  const [localKbSources, setLocalKbSources] = useState<KBSource[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadStatusIdx, setUploadStatusIdx] = useState(0);

  const UPLOAD_STATUSES = [
    "Uploading files...",
    "Processing documents...",
    "Extracting text...",
    "Analyzing content...",
    "Almost ready...",
  ];

  useEffect(() => {
    if (!isProcessingFiles) { setUploadStatusIdx(0); return; }
    const interval = setInterval(() => {
      setUploadStatusIdx(prev => (prev + 1) % UPLOAD_STATUSES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isProcessingFiles]);
  
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

  // Fetch KB sources if not provided
  useEffect(() => {
    if (kbSources) return;
    if (!profile?.organization_id) return;
    supabase
      .from("knowledge_entries")
      .select("id, title, category")
      .or(`organization_id.eq.${profile.organization_id},is_global.eq.true`)
      .order("title")
      .then(({ data }) => setLocalKbSources(data || []));
  }, [profile?.organization_id, kbSources]);

  const effectiveVaults = vaults || localVaults;
  const effectiveKb = kbSources || localKbSources;

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

  const hasChips = workflowTag || selectedVault || deepResearch || (activeSources && activeSources.length > 0) || (attachedFiles && attachedFiles.length > 0) || promptMode;

  return (
    <div
      className={cn("border rounded-lg bg-card overflow-hidden transition-colors", isDraggingOver ? "border-primary border-dashed bg-primary/5" : "border-border")}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsDraggingOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length && onFilesDropped) {
          onFilesDropped(files);
        }
      }}
    >
      {isDraggingOver && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-primary font-medium">
          <Upload className="h-3.5 w-3.5" />
          Drop files here
        </div>
      )}
      {/* Chips area — exact clone of Home */}
      {hasChips && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3 bg-muted/30">
          {workflowTag && (
            <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2 max-w-[200px]">
              <Zap className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{workflowTag.title}</span>
              <button onClick={onWorkflowTagRemove} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          )}
          {selectedVault && (
            <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2 max-w-[200px]">
              <FolderOpen className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{selectedVault.name}</span>
              <button onClick={() => onVaultSelect?.(null)} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          )}
          {deepResearch && (
            <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
              <Zap className="h-2.5 w-2.5 shrink-0" />
              Deep Research
              <button onClick={() => onDeepResearchChange?.(false)} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          )}
          {activeSources?.map((source) => (
            <Badge key={source} variant="secondary" className="gap-1 text-[10px] py-0.5 px-2 max-w-[200px]">
              <Scale className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{source}</span>
              <button onClick={() => onSourceToggle?.(source)} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ))}
          {attachedFiles?.map((file, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-2 max-w-[200px]">
              <FileText className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{file.name}</span>
              <button onClick={() => onRemoveFile?.(i)} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          ))}
          {promptMode && (
            <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">
                {promptMode === "red_flags" ? "Red Flag Detection" : promptMode === "drafting" ? "Document Drafting" : promptMode === "review" ? "Review Table" : "Chat Mode"}
              </span>
              <button onClick={() => onPromptModeChange?.(undefined)} className="ml-0.5 shrink-0">
                <X className="h-2 w-2" />
              </button>
            </Badge>
          )}
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
        {/* Sources button — with Upload files, Vaults, KB, Jurisdictions */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
              <Plus className="h-3.5 w-3.5" />
              Sources
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 overflow-hidden" align="start">
            <ScrollArea className="max-h-[400px]">
              <div className="p-2">
                {/* Upload files */}
                {onFileSelect && (
                  <>
                    <button
                      onClick={onFileSelect}
                      disabled={isProcessingFiles}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                    >
                      {isProcessingFiles ? (
                        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      Upload files
                    </button>
                    <div className="my-1 h-px bg-border" />
                  </>
                )}

                {effectiveVaults.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                      Vaults
                    </p>
                    <div className="max-h-[140px] overflow-y-auto">
                      {effectiveVaults.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => onVaultSelect?.(selectedVault?.id === v.id ? null : v)}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{v.name}</span>
                          </span>
                          {selectedVault?.id === v.id && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="my-1 h-px bg-border" />
                  </>
                )}

                {effectiveKb.length > 0 && (
                  <>
                    <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                      Knowledge Base
                    </p>
                    {effectiveKb.map((kb) => (
                      <button
                        key={kb.id}
                        onClick={() => onSourceToggle?.(kb.title)}
                        className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          {kb.title}
                        </span>
                        {activeSources?.includes(kb.title) && (
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
                    placeholder="Filter jurisdictions..."
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
          disabled={disabled || !value.trim() || isProcessingFiles}
        >
          {isProcessingFiles ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              {UPLOAD_STATUSES[uploadStatusIdx]}
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
