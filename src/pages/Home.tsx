import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Sparkles,
  Globe,
  Send,
  X,
  Upload,
  FolderOpen,
  Search,
  FileText,
  Scale,
  Clock,
  ListChecks,
  ChevronRight,
  BookOpen,
  Loader2,
  Zap,
  AlertTriangle,
} from "lucide-react";

interface VaultItem {
  id: string;
  name: string;
}

interface KBSource {
  id: string;
  title: string;
  category: string | null;
}

interface PromptTemplate {
  id: string;
  label: string;
  prompt: string;
}

// Jurisdiction sources
const JURISDICTION_SOURCES = [
  { name: "Web Search", icon: Globe },
  { name: "EDGAR (SEC)", icon: Scale },
  { name: "CourtListener", icon: Scale },
  { name: "EUR-Lex", icon: Scale },
  { name: "WorldLII", icon: Scale },
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
  { name: "Mexican Law", icon: Scale },
  { name: "Swedish Law", icon: Scale },
  { name: "Arabic Law", icon: Scale },
  { name: "Belgian Law", icon: Scale },
  { name: "Danish Law", icon: Scale },
  { name: "Chilean Law", icon: Scale },
  { name: "Finnish Law", icon: Scale },
  { name: "Dutch Law", icon: Scale },
  { name: "Portuguese Law", icon: Scale },
  { name: "Polish Law", icon: Scale },
  { name: "Swiss Law", icon: Scale },
  { name: "Hungarian Law", icon: Scale },
  { name: "Austrian Law", icon: Scale },
  { name: "Czech Law", icon: Scale },
  { name: "Dominican Republic Law", icon: Scale },
  { name: "Ecuadorian Law", icon: Scale },
  { name: "Luxembourgish Law", icon: Scale },
  { name: "Paraguayan Law", icon: Scale },
  { name: "Peruvian Law", icon: Scale },
  { name: "Spanish Law", icon: Scale },
  { name: "Japanese Law", icon: Scale },
  { name: "South Korean Law", icon: Scale },
  { name: "Chinese Law", icon: Scale },
  { name: "Russian Law", icon: Scale },
  { name: "Turkish Law", icon: Scale },
  { name: "South African Law", icon: Scale },
  { name: "Nigerian Law", icon: Scale },
  { name: "Kenyan Law", icon: Scale },
  { name: "Israeli Law", icon: Scale },
  { name: "Thai Law", icon: Scale },
  { name: "Malaysian Law", icon: Scale },
  { name: "Indonesian Law", icon: Scale },
  { name: "Philippine Law", icon: Scale },
  { name: "Colombian Law", icon: Scale },
  { name: "Argentine Law", icon: Scale },
  { name: "Greek Law", icon: Scale },
  { name: "Romanian Law", icon: Scale },
  { name: "Croatian Law", icon: Scale },
  { name: "Norwegian Law", icon: Scale },
  { name: "Irish Law", icon: Scale },
  { name: "New Zealand Law", icon: Scale },
  { name: "Hong Kong Law", icon: Scale },
  { name: "Casablanca Agreement", icon: Scale },
  { name: "Whitford Lane", icon: Scale },
];

// Icon mapping for workflow configs
const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  Clock,
  ListChecks,
  Scale,
  Search,
  BookOpen,
  Zap,
  AlertTriangle,
};

interface WorkflowCard {
  title: string;
  description: string;
  type: string;
  steps: number;
  icon: React.ElementType;
}

const DEFAULT_WORKFLOWS: WorkflowCard[] = [
  {
    title: "Draft a client alert",
    description: "Generate a structured legal alert based on recent developments",
    type: "Workflow",
    steps: 4,
    icon: FileText,
  },
  {
    title: "Generate post-closing timeline",
    description: "Create a timeline of obligations from closing documents",
    type: "Workflow",
    steps: 3,
    icon: Clock,
  },
  {
    title: "Extract chronology from filings",
    description: "Build a fact chronology from multiple court filings",
    type: "Workflow",
    steps: 5,
    icon: ListChecks,
  },
  {
    title: "Review contract key terms",
    description: "Extract and compare key terms across agreements",
    type: "Workflow",
    steps: 3,
    icon: Scale,
  },
];

export default function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const [message, setMessage] = useState("");
  const [deepResearch, setDeepResearch] = useState(false);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultItem | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [kbSources, setKbSources] = useState<KBSource[]>([]);
  const [improving, setImproving] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [promptMode, setPromptMode] = useState<string | undefined>();
  const [workflows, setWorkflows] = useState<WorkflowCard[]>(DEFAULT_WORKFLOWS);

  useEffect(() => {
    if (!profile?.organization_id) return;
    
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setVaults(data || []));

    supabase
      .from("knowledge_entries")
      .select("id, title, category")
      .or(`organization_id.eq.${profile.organization_id},is_global.eq.true`)
      .order("title")
      .then(({ data }) => setKbSources(data || []));

    // Load agent config (prompts + workflows)
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

          // Load workflows from config
          if (c.workflows && c.workflows.length > 0) {
            setWorkflows(c.workflows.map((wf: any) => ({
              title: wf.title,
              description: wf.description,
              type: wf.type || "Workflow",
              steps: wf.steps || 3,
              icon: ICON_MAP[wf.icon] || FileText,
            })));
          }
        }
      });
  }, [profile?.organization_id]);

  const handleSend = () => {
    if (!message.trim()) return;
    navigate("/chat", {
      state: {
        initialMessage: message,
        deepResearch,
        selectedVault,
        attachedFiles,
        activeSources,
        promptMode,
      },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      setAttachedFiles((prev) => [...prev, ...files]);
    };
    input.click();
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleSource = (source: string) => {
    setActiveSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const handleImprove = async () => {
    if (!message.trim() || improving) return;
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
            message: `Rewrite and improve this legal research prompt to be clearer, more specific, and more effective. Return ONLY the improved prompt, nothing else:\n\n"${message}"`,
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
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

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
        setMessage(clean);
        toast({ title: "Prompt improved" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setImproving(false);
    }
  };

  const filteredJurisdictions = searchFilter
    ? JURISDICTION_SOURCES.filter(j => j.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : JURISDICTION_SOURCES;

  const hasChips = selectedVault || deepResearch || activeSources.length > 0 || attachedFiles.length > 0 || promptMode;

  return (
    <AppLayout>
      <div className="flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-8">
          {/* Heading */}
          <div className="text-center space-y-2">
            <h1 className="font-heading text-4xl font-semibold text-foreground tracking-tight">
              LawKit
            </h1>
            <p className="text-sm text-muted-foreground">
              Your AI-powered legal research and drafting assistant
            </p>
          </div>

          {/* Main prompt box */}
          <div className="border border-border rounded-lg overflow-hidden">
            {hasChips && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3 bg-muted/30">
                {selectedVault && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <FolderOpen className="h-2.5 w-2.5" />
                    {selectedVault.name}
                    <button onClick={() => setSelectedVault(null)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
                {deepResearch && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <Zap className="h-2.5 w-2.5" />
                    Deep Research
                    <button onClick={() => setDeepResearch(false)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
                {activeSources.map((source) => (
                  <Badge key={source} variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <Scale className="h-2.5 w-2.5" />
                    {source}
                    <button onClick={() => toggleSource(source)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
                {attachedFiles.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <FileText className="h-2.5 w-2.5" />
                    {file.name}
                    <button onClick={() => removeFile(i)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                ))}
                {promptMode && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <Sparkles className="h-2.5 w-2.5" />
                    {promptMode === "red_flags" ? "Red Flag Detection" : promptMode === "drafting" ? "Document Drafting" : "Chat Mode"}
                    <button onClick={() => setPromptMode(undefined)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask LawKit anything..."
              className="border-0 focus-visible:ring-0 resize-none min-h-[100px] text-sm bg-muted/30 px-4 pt-4"
              rows={4}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center gap-1 px-3 py-2.5 border-t border-border bg-muted/30">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    Sources
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <ScrollArea className="max-h-[400px]">
                    <div className="p-2">
                      <button
                        onClick={handleFileSelect}
                        className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                      >
                        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                        Upload files
                      </button>

                      {vaults.length > 0 && (
                        <>
                          <div className="my-1 h-px bg-border" />
                          <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                            Vaults
                          </p>
                          {vaults.slice(0, 5).map((v) => (
                            <button
                              key={v.id}
                              onClick={() => setSelectedVault(v)}
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
                        </>
                      )}

                      {kbSources.length > 0 && (
                        <>
                          <div className="my-1 h-px bg-border" />
                          <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                            Knowledge Base
                          </p>
                          {kbSources.map((kb) => (
                            <button
                              key={kb.id}
                              onClick={() => toggleSource(kb.title)}
                              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                            >
                              <span className="flex items-center gap-2.5">
                                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {kb.title}
                              </span>
                              {activeSources.includes(kb.title) && (
                                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                              )}
                            </button>
                          ))}
                        </>
                      )}

                      <div className="my-1 h-px bg-border" />
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
                          onClick={() => toggleSource(j.name)}
                          className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                        >
                          <span className="flex items-center gap-2.5">
                            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                            {j.name}
                          </span>
                          {activeSources.includes(j.name) && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              {/* Mode selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
                    {promptMode === "red_flags" ? <AlertTriangle className="h-3.5 w-3.5" /> : promptMode === "drafting" ? <FileText className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
                    {promptMode === "red_flags" ? "Red Flag Detection" : promptMode === "drafting" ? "Draft Document" : "Chat / Research"}
                    <ChevronRight className="h-2.5 w-2.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-1.5" align="start">
                  {[
                    { id: "chat", label: "Chat / Research", description: "Ask questions, analyze documents, research topics", icon: Scale },
                    { id: "drafting", label: "Draft Document", description: "Generate contracts, memos, briefs, and legal documents", icon: FileText },
                    { id: "red_flags", label: "Red Flag Detection", description: "Identify risks, compliance issues, and red flags", icon: AlertTriangle },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => {
                        setPromptMode(mode.id === "chat" ? undefined : mode.id);
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

              {/* Improve */}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleImprove}
                disabled={!message.trim() || improving}
              >
                {improving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Improve
              </Button>

              {/* Deep Research toggle */}
              <div className="flex items-center gap-1.5 ml-1">
                <Switch
                  checked={deepResearch}
                  onCheckedChange={setDeepResearch}
                  className="scale-75"
                />
                <span className="text-[10px] text-muted-foreground">Deep research</span>
              </div>

              <div className="flex-1" />

              <Button
                size="sm"
                className="h-7 px-4 text-xs gap-1.5"
                onClick={handleSend}
                disabled={!message.trim()}
              >
                Ask LawKit
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Recommended workflows */}
          <div className="space-y-3 pb-8">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">
              Recommended workflows
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workflows.map((wf) => (
                <button
                  key={wf.title}
                  className="flex items-start gap-3 rounded-lg border border-border p-3.5 text-left hover:bg-muted/50 transition-colors group"
                  onClick={() => {
                    navigate("/chat", {
                      state: {
                        initialMessage: wf.description,
                        deepResearch,
                        activeSources,
                      },
                    });
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary shrink-0">
                    <wf.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground">{wf.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{wf.description}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[9px] py-0 px-1.5">{wf.type}</Badge>
                      <span className="text-[10px] text-muted-foreground">{wf.steps} steps</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
