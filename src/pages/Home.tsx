import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ChatInput } from "@/components/chat/ChatInput";
import type { WorkflowTag } from "@/components/chat/ChatInput";
import {
  FileText,
  Scale,
  Clock,
  ListChecks,
  ChevronRight,
  BookOpen,
  Loader2,
  Zap,
  AlertTriangle,
  Search,
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

interface WorkflowConfig {
  title: string;
  description: string;
  type: string;
  steps: number;
  icon: string;
  systemPrompt?: string;
}

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
  systemPrompt?: string;
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

// Session storage helpers for persisting prompt state
const SS_KEY = "lawkit_home_state";

function loadSessionState() {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveSessionState(state: any) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(state));
  } catch {}
}

export default function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();

  // Restore from sessionStorage
  const saved = useRef(loadSessionState());

  const [message, setMessage] = useState(saved.current?.message || "");
  const [deepResearch, setDeepResearch] = useState(saved.current?.deepResearch || false);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [selectedVault, setSelectedVault] = useState<VaultItem | null>(saved.current?.selectedVault || null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [activeSources, setActiveSources] = useState<string[]>(saved.current?.activeSources || []);
  const [kbSources, setKbSources] = useState<KBSource[]>([]);
  const [promptMode, setPromptMode] = useState<string | undefined>(saved.current?.promptMode || undefined);
  const [workflows, setWorkflows] = useState<WorkflowCard[]>(DEFAULT_WORKFLOWS);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTag | null>(saved.current?.selectedWorkflow || null);

  // Persist state to sessionStorage on changes
  useEffect(() => {
    saveSessionState({
      message,
      deepResearch,
      selectedVault,
      activeSources,
      promptMode,
      selectedWorkflow,
    });
  }, [message, deepResearch, selectedVault, activeSources, promptMode, selectedWorkflow]);

  // Handle fillPrompt from Workflows page
  useEffect(() => {
    const state = location.state as any;
    if (state?.fillPrompt) {
      setMessage(state.fillPrompt);
      navigate("/", { replace: true, state: {} });
    }
    if (state?.workflowTag) {
      setSelectedWorkflow(state.workflowTag);
      navigate("/", { replace: true, state: {} });
    }
  }, [location.state]);

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

    // Load agent config (workflows)
    supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "agent_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const c = (data.config as any) || {};
          if (c.workflows && c.workflows.length > 0) {
            setWorkflows(c.workflows.map((wf: any) => ({
              title: wf.title,
              description: wf.description,
              type: wf.type || "Workflow",
              steps: wf.steps || 3,
              icon: ICON_MAP[wf.icon] || FileText,
              systemPrompt: wf.systemPrompt,
            })));
          }
        }
      });
  }, [profile?.organization_id]);

  const [isSendingWithFiles, setIsSendingWithFiles] = useState(false);

  const processAttachedFilesForHome = async (files: File[]): Promise<{ fileIds: string[]; fileNames: string[]; vaultId: string }> => {
    if (!profile?.organization_id) throw new Error("No org");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    // Find or create an "Uploads" vault
    let { data: pVault } = await supabase
      .from("vaults")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("name", "Uploads")
      .maybeSingle();

    if (!pVault) {
      const { data: legacyVault } = await supabase
        .from("vaults")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("name", "Prompt Uploads")
        .maybeSingle();

      if (legacyVault) {
        pVault = legacyVault;
      } else {
        const { data: newVault, error: vErr } = await supabase
          .from("vaults")
          .insert({ name: "Uploads", organization_id: profile.organization_id, created_by: profile.id, description: "Default vault for uploaded documents" })
          .select()
          .single();
        if (vErr || !newVault) throw new Error("Failed to create upload vault");
        pVault = newVault;
      }
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const fileIds: string[] = [];
    const fileNames: string[] = [];

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const sanitizedName = file.name.replace(/\s+/g, "_").replace(/[()]/g, "");
      const r2Key = `${profile.organization_id}/${pVault.id}/${fileId}-${sanitizedName}`;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgId", profile.organization_id);
      formData.append("r2Key", r2Key);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/r2-upload`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: formData }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const result = await response.json();

      await supabase.from("files").insert({
        id: fileId,
        name: file.name,
        original_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        storage_path: result.r2_key || r2Key,
        vault_id: pVault.id,
        organization_id: profile.organization_id!,
        uploaded_by: profile.id,
        status: "processing",
      });

      supabase.functions.invoke("document-processor", { body: { fileId } }).catch(() => {});

      fileIds.push(fileId);
      fileNames.push(file.name);
    }

    return { fileIds, fileNames, vaultId: pVault.id };
  };

  const handleSend = async () => {
    if (!message.trim() || isSendingWithFiles) return;
    sessionStorage.removeItem(SS_KEY);

    if (attachedFiles.length > 0) {
      setIsSendingWithFiles(true);
      try {
        const { fileIds, fileNames, vaultId: uploadVaultId } = await processAttachedFilesForHome(attachedFiles);
        navigate("/chat", {
          state: {
            initialMessage: message,
            deepResearch,
            selectedVault: selectedVault || { id: uploadVaultId, name: "Uploads" },
            activeSources,
            promptMode,
            workflowTag: selectedWorkflow,
            attachedFileIds: fileIds,
            attachedFileNames: fileNames,
          },
        });
      } catch (err: any) {
        toast({ title: "File upload failed", description: err.message, variant: "destructive" });
        setIsSendingWithFiles(false);
      }
    } else {
      navigate("/chat", {
        state: {
          initialMessage: message,
          deepResearch,
          selectedVault,
          activeSources,
          promptMode,
          workflowTag: selectedWorkflow,
        },
      });
    }
  };

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.pptx,.png,.jpg,.jpeg,.webp";
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

  // Workflow click adds as tag, not as text
  const handleWorkflowClick = (wf: WorkflowCard) => {
    setSelectedWorkflow({ title: wf.title, systemPrompt: wf.systemPrompt });
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

          {/* Main prompt box — uses the same ChatInput component as Chat page */}
          <ChatInput
            value={message}
            onChange={setMessage}
            onSend={handleSend}
            disabled={isSendingWithFiles}
            deepResearch={deepResearch}
            onDeepResearchChange={setDeepResearch}
            promptMode={promptMode}
            onPromptModeChange={setPromptMode}
            vaults={vaults}
            selectedVault={selectedVault}
            onVaultSelect={setSelectedVault}
            activeSources={activeSources}
            onSourceToggle={toggleSource}
            workflowTag={selectedWorkflow}
            onWorkflowTagRemove={() => setSelectedWorkflow(null)}
            attachedFiles={attachedFiles}
            onFileSelect={handleFileSelect}
            onRemoveFile={removeFile}
            onFilesDropped={(files) => setAttachedFiles(prev => [...prev, ...files])}
            isProcessingFiles={isSendingWithFiles}
            kbSources={kbSources}
          />

          {/* Recommended workflows - click adds as tag */}
          <div className="space-y-3 pb-8">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider text-center">
              Recommended workflows
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workflows.map((wf) => (
                <button
                  key={wf.title}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3.5 text-left hover:bg-muted/50 transition-colors group",
                    selectedWorkflow?.title === wf.title ? "border-primary bg-primary/5" : "border-border"
                  )}
                  onClick={() => handleWorkflowClick(wf)}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary shrink-0">
                    <wf.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-medium text-foreground">{wf.title}</p>
                    </div>
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
