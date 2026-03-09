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
import {
  Plus,
  Paperclip,
  BookOpen,
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
} from "lucide-react";

interface VaultItem {
  id: string;
  name: string;
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

  const [message, setMessage] = useState("");
  const [deepResearch, setDeepResearch] = useState(false);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultItem | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState<{ name: string; provider: string }[]>([]);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setVaults(data || []));

    supabase
      .from("api_integrations")
      .select("name, provider")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true)
      .then(({ data }) => setIntegrations(data || []));
  }, [profile?.organization_id]);

  const handleSend = () => {
    if (!message.trim()) return;
    navigate("/chat", { state: { initialMessage: message, deepResearch, selectedVault, attachedFiles, activeSources } });
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

          {/* Context chips above input */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {selectedVault ? (
              <Badge
                variant="outline"
                className="gap-1.5 cursor-pointer hover:bg-muted text-xs py-1 px-2.5"
                onClick={() => setSelectedVault(null)}
              >
                <FolderOpen className="h-3 w-3" />
                {selectedVault.name}
                <X className="h-2.5 w-2.5 ml-0.5" />
              </Badge>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    Choose vault
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="center">
                  <p className="text-xs font-medium text-foreground px-2 py-1.5">Select a vault</p>
                  {vaults.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVault(v)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                    >
                      <FolderOpen className="h-3 w-3 text-muted-foreground" />
                      {v.name}
                    </button>
                  ))}
                  {vaults.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1.5">No vaults yet</p>
                  )}
                </PopoverContent>
              </Popover>
            )}
            <span className="text-border">·</span>
            <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <Scale className="h-3 w-3" />
              Set client matter
            </button>
          </div>

          {/* Attached files */}
          {(attachedFiles.length > 0 || activeSources.length > 0) && (
            <div className="flex flex-wrap gap-1.5 justify-center">
              {attachedFiles.map((file, i) => (
                <Badge key={i} variant="secondary" className="gap-1.5 text-xs py-1 px-2.5">
                  <FileText className="h-3 w-3" />
                  {file.name}
                  <button onClick={() => removeFile(i)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              {activeSources.map((source) => (
                <Badge key={source} variant="secondary" className="gap-1.5 text-xs py-1 px-2.5">
                  <Globe className="h-3 w-3" />
                  {source}
                  <button onClick={() => toggleSource(source)}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* Main prompt box */}
          <div className="border border-border rounded-lg bg-card overflow-hidden">
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
                <PopoverContent className="w-56 p-2" align="start">
                  <button
                    onClick={handleFileSelect}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-xs text-foreground hover:bg-muted transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    Upload files
                  </button>
                  <div className="my-1 h-px bg-border" />
                  <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">From vault</p>
                  {vaults.slice(0, 5).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVault(v)}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      {v.name}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">Sources</p>
                  {["Web search", "EDGAR", "LexisNexis"].map((src) => (
                    <button
                      key={src}
                      onClick={() => toggleSource(src)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        {src}
                      </span>
                      {activeSources.includes(src) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Prompts
              </Button>

              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Wand2 className="h-3.5 w-3.5" />
                Customize
              </Button>

              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Improve
              </Button>

              <div className="mx-1 h-4 w-px bg-border" />

              {/* Deep research toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Deep research</span>
                <Switch
                  checked={deepResearch}
                  onCheckedChange={setDeepResearch}
                  className="scale-75"
                />
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

          {/* Integration chips */}
          {integrations.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {integrations.map((int) => (
                <Badge
                  key={int.name}
                  variant="outline"
                  className="text-[10px] cursor-pointer hover:bg-muted py-0.5 px-2"
                  onClick={() => toggleSource(int.name)}
                >
                  <Plus className="h-2.5 w-2.5 mr-1" />
                  {int.name}
                </Badge>
              ))}
            </div>
          )}

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
