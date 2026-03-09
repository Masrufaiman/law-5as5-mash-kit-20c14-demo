import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Sparkles,
  Wand2,
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
} from "lucide-react";

const INTERNAL_PROVIDERS = ["cloudflare_r2", "agent_config", "knowledge_document"];

interface VaultItem {
  id: string;
  name: string;
}

interface KBSource {
  id: string;
  title: string;
  category: string | null;
}

interface WorkflowCard {
  title: string;
  description: string;
  type: string;
  steps: number;
  icon: React.ElementType;
}

const WORKFLOWS: WorkflowCard[] = [
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
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [improving, setImproving] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    
    // Load vaults
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setVaults(data || []));

    // Load knowledge base entries as sources
    supabase
      .from("knowledge_entries")
      .select("id, title, category")
      .or(`organization_id.eq.${profile.organization_id},is_global.eq.true`)
      .order("title")
      .then(({ data }) => setKbSources(data || []));
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
        webSearch: webSearchEnabled,
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
        // Remove surrounding quotes if present
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

  // Chips that go inside the prompt box
  const hasChips = selectedVault || webSearchEnabled || deepResearch || activeSources.length > 0 || attachedFiles.length > 0;

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
          <div className="border border-border rounded-lg bg-card overflow-hidden">
            {/* Tags inside prompt box */}
            {hasChips && (
              <div className="flex flex-wrap gap-1.5 px-3 pt-3">
                {selectedVault && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <FolderOpen className="h-2.5 w-2.5" />
                    {selectedVault.name}
                    <button onClick={() => setSelectedVault(null)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
                {webSearchEnabled && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <Globe className="h-2.5 w-2.5" />
                    Web Search
                    <button onClick={() => setWebSearchEnabled(false)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
                {deepResearch && (
                  <Badge variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <Search className="h-2.5 w-2.5" />
                    Deep Research
                    <button onClick={() => setDeepResearch(false)} className="ml-0.5">
                      <X className="h-2 w-2" />
                    </button>
                  </Badge>
                )}
                {activeSources.map((source) => (
                  <Badge key={source} variant="secondary" className="gap-1 text-[10px] py-0.5 px-2">
                    <BookOpen className="h-2.5 w-2.5" />
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
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask LawKit anything..."
              className="border-0 focus-visible:ring-0 resize-none min-h-[100px] text-sm bg-transparent px-4 pt-4"
              rows={4}
            />

            {/* Bottom toolbar */}
            <div className="flex items-center gap-1 px-3 py-2.5 border-t border-border bg-muted/30">
              {/* Files and sources */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                    <Plus className="h-3.5 w-3.5" />
                    Files & sources
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <button
                    onClick={handleFileSelect}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    Upload files
                  </button>

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
                  {vaults.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2.5 py-1.5">No vaults yet</p>
                  )}

                  <div className="my-1 h-px bg-border" />
                  <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
                    Search
                  </p>
                  <button
                    onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Web Search
                    </span>
                    {webSearchEnabled && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                  <button
                    onClick={() => setDeepResearch(!deepResearch)}
                    className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      Deep Research
                    </span>
                    {deepResearch && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>

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
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Prompts
              </Button>

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
              {WORKFLOWS.map((wf) => (
                <button
                  key={wf.title}
                  className="flex items-start gap-3 rounded-lg border border-border p-3.5 text-left hover:bg-muted/50 transition-colors group"
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
