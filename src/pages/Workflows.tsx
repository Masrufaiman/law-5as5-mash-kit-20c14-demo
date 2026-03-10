import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  FileText,
  Clock,
  ListChecks,
  Scale,
  BookOpen,
  Zap,
  AlertTriangle,
  ChevronRight,
  Loader2,
  Sparkles,
  Pencil,
  Trash2,
  User,
} from "lucide-react";

const ICON_MAP: Record<string, React.ElementType> = {
  FileText, Clock, ListChecks, Scale, Search, BookOpen, Zap, AlertTriangle,
};

const ICON_OPTIONS = ["FileText", "Clock", "ListChecks", "Scale", "Search", "BookOpen", "Zap", "AlertTriangle"];

interface WorkflowItem {
  title: string;
  description: string;
  type: string;
  steps: number;
  icon: string;
  category?: string;
  systemPrompt?: string;
  created_by?: string;
}

const OUTPUT_TYPES = ["All", "Draft", "Review", "Output"];
const CATEGORIES = ["All", "Litigation", "Transactional", "Financial Services"];

export default function Workflows() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [outputFilter, setOutputFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [createDesc, setCreateDesc] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowItem | null>(null);
  const [editForm, setEditForm] = useState<WorkflowItem>({ title: "", description: "", type: "Draft", steps: 3, icon: "FileText", category: "", systemPrompt: "" });

  // Load workflows from agent_config
  useEffect(() => {
    if (!profile?.organization_id) return;
    setIsLoading(true);
    supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "agent_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const c = (data.config as any) || {};
          if (c.workflows?.length) {
            setWorkflows(c.workflows);
          }
        }
        setIsLoading(false);
      });
  }, [profile?.organization_id]);

  const handleWorkflowClick = (wf: WorkflowItem) => {
    navigate("/", { state: { workflowTag: { title: wf.title, systemPrompt: wf.systemPrompt } } });
  };

  const saveWorkflows = async (newWorkflows: WorkflowItem[]) => {
    if (!profile?.organization_id) return;
    const { data: existing } = await supabase
      .from("api_integrations")
      .select("id, config")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "agent_config")
      .maybeSingle();

    const config = { ...((existing?.config as any) || {}), workflows: newWorkflows };
    if (existing) {
      await supabase.from("api_integrations").update({ config }).eq("id", existing.id);
    } else {
      await supabase.from("api_integrations").insert({
        organization_id: profile.organization_id,
        provider: "agent_config",
        name: "Agent Configuration",
        config,
      });
    }
  };

  const handleCreateWorkflow = async () => {
    if (!createDesc.trim() || !profile?.organization_id) return;
    setIsBuilding(true);
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
            message: `Create a workflow based on this description. Return ONLY valid JSON with this exact format, no other text:\n{"title":"short title","description":"1-2 sentence description","type":"Draft|Review|Output","steps":3,"icon":"FileText","category":"Litigation|Transactional|Financial Services","systemPrompt":"detailed system prompt for the AI"}\n\nUser description: "${createDesc}"`,
            history: [],
            useCase: "workflow_builder",
          }),
        }
      );

      if (!resp.ok) throw new Error("Failed to build workflow");

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === "token") result += parsed.content;
          } catch {}
        }
      }

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Invalid response");
      const wf: WorkflowItem = JSON.parse(jsonMatch[0]);
      wf.created_by = profile.id;

      const newWorkflows = [...workflows, wf];
      setWorkflows(newWorkflows);
      await saveWorkflows(newWorkflows);

      toast({ title: "Workflow created", description: wf.title });
      setShowCreate(false);
      setCreateDesc("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDeleteWorkflow = async (wf: WorkflowItem) => {
    const newWorkflows = workflows.filter(w => w.title !== wf.title);
    setWorkflows(newWorkflows);
    await saveWorkflows(newWorkflows);
    toast({ title: "Deleted", description: `"${wf.title}" removed` });
  };

  const openEdit = (wf: WorkflowItem) => {
    setEditingWorkflow(wf);
    setEditForm({ ...wf });
  };

  const handleSaveEdit = async () => {
    if (!editingWorkflow) return;
    const newWorkflows = workflows.map(w =>
      w.title === editingWorkflow.title ? { ...editForm, created_by: w.created_by } : w
    );
    setWorkflows(newWorkflows);
    await saveWorkflows(newWorkflows);
    setEditingWorkflow(null);
    toast({ title: "Saved", description: "Workflow updated" });
  };

  const filtered = workflows.filter((wf) => {
    if (outputFilter !== "All" && wf.type !== outputFilter) return false;
    if (categoryFilter !== "All" && wf.category !== categoryFilter) return false;
    if (ownerFilter === "mine" && wf.created_by !== profile?.id) return false;
    if (searchQuery && !wf.title.toLowerCase().includes(searchQuery.toLowerCase()) && !wf.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <div>
            <h1 className="text-lg font-heading font-semibold text-foreground">Workflows</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Pre-built and custom AI workflows for your practice</p>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create workflow
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border/30 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workflows..."
              className="h-8 text-xs pl-8"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setOwnerFilter("all")} className={cn("px-2.5 py-1 rounded-md text-xs transition-colors", ownerFilter === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>All</button>
            <button onClick={() => setOwnerFilter("mine")} className={cn("px-2.5 py-1 rounded-md text-xs transition-colors", ownerFilter === "mine" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>My Workflows</button>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            {OUTPUT_TYPES.map((t) => (
              <button key={t} onClick={() => setOutputFilter(t)} className={cn("px-2.5 py-1 rounded-md text-xs transition-colors", outputFilter === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t}</button>
            ))}
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} className={cn("px-2.5 py-1 rounded-md text-xs transition-colors", categoryFilter === c ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted")}>{c}</button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-14 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((wf, i) => {
                  const Icon = ICON_MAP[wf.icon] || FileText;
                  const isOwn = wf.created_by === profile?.id;
                  return (
                    <div
                      key={`${wf.title}-${i}`}
                      className="flex flex-col items-start gap-3 rounded-lg border border-border p-4 text-left hover:bg-muted/50 hover:border-primary/30 transition-all group relative"
                    >
                      <button className="flex items-center gap-3 w-full" onClick={() => handleWorkflowClick(wf)}>
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{wf.title}</p>
                          {wf.category && <p className="text-[10px] text-muted-foreground">{wf.category}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                      <p className="text-xs text-muted-foreground line-clamp-2">{wf.description}</p>
                      <div className="flex items-center gap-2 w-full">
                        <Badge variant="outline" className="text-[9px] py-0 px-1.5">{wf.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{wf.steps} steps</span>
                        {wf.created_by && (
                          <Badge variant="secondary" className="text-[9px] py-0 px-1.5 gap-0.5">
                            <User className="h-2 w-2" />
                            {isOwn ? "You" : "User"}
                          </Badge>
                        )}
                        <div className="flex-1" />
                        {isOwn && (
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(wf); }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Edit workflow"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(wf); }}
                              className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Search className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No workflows match your filters</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create workflow dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Create Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Describe what you want this workflow to do. Our AI will build it for you.
            </p>
            <Textarea
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="e.g., I want a workflow that reviews NDAs and extracts key terms like confidentiality period, exceptions, governing law, and termination clauses into a structured table..."
              className="min-h-[120px] text-sm"
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateWorkflow} disabled={!createDesc.trim() || isBuilding}>
              {isBuilding ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Building...</>
              ) : (
                <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Build Workflow</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit workflow dialog — all fields */}
      <Dialog open={!!editingWorkflow} onOpenChange={(open) => !open && setEditingWorkflow(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Edit Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Title</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Icon</Label>
                <Select value={editForm.icon} onValueChange={(v) => setEditForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(icon => <SelectItem key={icon} value={icon}>{icon}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Review">Review</SelectItem>
                    <SelectItem value="Output">Output</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Steps</Label>
                <Input type="number" min={1} max={10} value={editForm.steps} onChange={(e) => setEditForm(f => ({ ...f, steps: parseInt(e.target.value) || 1 }))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={editForm.category || ""} onValueChange={(v) => setEditForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Litigation">Litigation</SelectItem>
                    <SelectItem value="Transactional">Transactional</SelectItem>
                    <SelectItem value="Financial Services">Financial Services</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">System Prompt</Label>
              <Textarea
                value={editForm.systemPrompt || ""}
                onChange={(e) => setEditForm(f => ({ ...f, systemPrompt: e.target.value }))}
                placeholder="Enter the system prompt for this workflow..."
                className="min-h-[150px] text-sm font-mono"
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditingWorkflow(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
