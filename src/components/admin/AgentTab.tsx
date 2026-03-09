import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Bot, Wrench, FileText, Gauge, Brain, AlertTriangle, PenTool, Workflow, Database, Eye, Plus, Trash2 } from "lucide-react";

const JURISDICTIONS = ["United States", "United Kingdom", "European Union", "Australia", "Canada", "India", "Singapore", "Hong Kong"];
const CITATION_STYLES = ["Bluebook", "OSCOLA", "AGLC", "McGill", "APA Legal", "Chicago"];
const EMBEDDING_MODELS = ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"];

const PROMPT_USE_CASES = [
  { id: "chat", label: "Chat / Research", icon: Brain },
  { id: "red_flags", label: "Red Flag Detection", icon: AlertTriangle },
  { id: "drafting", label: "Document Drafting", icon: PenTool },
];

const WORKFLOW_ICONS = ["FileText", "Clock", "ListChecks", "Scale", "Search", "BookOpen", "Zap", "AlertTriangle"];

interface WorkflowConfig {
  id: string;
  title: string;
  description: string;
  type: string;
  steps: number;
  icon: string;
  systemPrompt: string;
}

interface AgentTabProps {
  orgId: string;
}

export function AgentTab({ orgId }: AgentTabProps) {
  const { toast } = useToast();
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Default behavior
  const [jurisdiction, setJurisdiction] = useState("United States");
  const [autoResearch, setAutoResearch] = useState(true);
  const [citationStyle, setCitationStyle] = useState("Bluebook");
  const [maxDepth, setMaxDepth] = useState("3");

  // Document Analysis
  const [docChunkSize, setDocChunkSize] = useState("1000");
  const [docChunkOverlap, setDocChunkOverlap] = useState("200");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");

  // Red Flag Detection
  const [redFlagThreshold, setRedFlagThreshold] = useState("medium");
  const [redFlagCategories, setRedFlagCategories] = useState<string[]>([
    "liability", "indemnity", "termination", "ip_assignment", "non_compete", "data_privacy",
  ]);

  // Prompt templates
  const [chatPrompt, setChatPrompt] = useState("");
  const [redFlagPrompt, setRedFlagPrompt] = useState("");
  const [draftingPrompt, setDraftingPrompt] = useState("");

  // Rate limits
  const [orgDailyLimit, setOrgDailyLimit] = useState("1000");
  const [userDailyLimit, setUserDailyLimit] = useState("100");

  // Workflows
  const [workflows, setWorkflows] = useState<WorkflowConfig[]>([]);

  // OCR (Mistral)
  const [mistralApiKey, setMistralApiKey] = useState("");

  // Qdrant
  const [qdrantUrl, setQdrantUrl] = useState("");
  const [qdrantApiKey, setQdrantApiKey] = useState("");
  const [qdrantCollectionPrefix, setQdrantCollectionPrefix] = useState("org_");

  // OpenAI (for embeddings)
  const [openaiApiKey, setOpenaiApiKey] = useState("");

  useEffect(() => {
    // Load agent config
    supabase
      .from("api_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "agent_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          const c = (data.config as any) || {};
          setJurisdiction(c.default_jurisdiction || "United States");
          setAutoResearch(c.auto_research ?? true);
          setCitationStyle(c.citation_style || "Bluebook");
          setMaxDepth(String(c.max_research_depth || 3));
          setDocChunkSize(String(c.document_analysis?.chunk_size || 1000));
          setDocChunkOverlap(String(c.document_analysis?.chunk_overlap || 200));
          setEmbeddingModel(c.document_analysis?.embedding_model || "text-embedding-3-small");
          setRedFlagThreshold(c.red_flag?.severity_threshold || "medium");
          setRedFlagCategories(c.red_flag?.categories || redFlagCategories);
          setChatPrompt(c.prompts?.chat || "");
          setRedFlagPrompt(c.prompts?.red_flags || "");
          setDraftingPrompt(c.prompts?.drafting || "");
          setOrgDailyLimit(String(c.rate_limits?.org_daily || 1000));
          setUserDailyLimit(String(c.rate_limits?.user_daily || 100));
          setWorkflows(c.workflows || []);
          // OCR
          setMistralApiKey(c.ocr?.mistral_api_key || "");
          // Qdrant
          setQdrantUrl(c.qdrant?.url || "");
          setQdrantApiKey(c.qdrant?.api_key || "");
          setQdrantCollectionPrefix(c.qdrant?.collection_prefix || "org_");
          // OpenAI
          setOpenaiApiKey(c.openai?.api_key || "");
        }
      });
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        default_jurisdiction: jurisdiction,
        auto_research: autoResearch,
        citation_style: citationStyle,
        max_research_depth: parseInt(maxDepth),
        document_analysis: {
          chunk_size: parseInt(docChunkSize),
          chunk_overlap: parseInt(docChunkOverlap),
          embedding_model: embeddingModel,
        },
        red_flag: {
          severity_threshold: redFlagThreshold,
          categories: redFlagCategories,
        },
        prompts: {
          chat: chatPrompt,
          red_flags: redFlagPrompt,
          drafting: draftingPrompt,
        },
        rate_limits: {
          org_daily: parseInt(orgDailyLimit),
          user_daily: parseInt(userDailyLimit),
        },
        workflows,
        ocr: {
          mistral_api_key: mistralApiKey,
        },
        qdrant: {
          url: qdrantUrl,
          api_key: qdrantApiKey,
          collection_prefix: qdrantCollectionPrefix,
        },
        openai: {
          api_key: openaiApiKey,
        },
      };

      const payload = {
        name: "Agent Configuration",
        provider: "agent_config",
        organization_id: orgId,
        config: JSON.parse(JSON.stringify(config)),
        is_active: true,
      };

      if (existingId) {
        const { error } = await supabase.from("api_integrations").update(payload).eq("id", existingId);
        if (error) throw error;
      } else {
        const { error, data } = await supabase.from("api_integrations").insert(payload).select().single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast({ title: "Saved", description: "Agent settings updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addWorkflow = () => {
    setWorkflows([...workflows, {
      id: crypto.randomUUID(),
      title: "",
      description: "",
      type: "Workflow",
      steps: 3,
      icon: "FileText",
      systemPrompt: "",
    }]);
  };

  const updateWorkflow = (id: string, field: keyof WorkflowConfig, value: any) => {
    setWorkflows(wfs => wfs.map(w => w.id === id ? { ...w, [field]: value } : w));
  };

  const removeWorkflow = (id: string) => {
    setWorkflows(wfs => wfs.filter(w => w.id !== id));
  };

  const RED_FLAG_CATEGORY_OPTIONS = [
    "liability", "indemnity", "termination", "ip_assignment", "non_compete",
    "data_privacy", "governing_law", "limitation_of_liability", "confidentiality", "warranty",
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Agentic AI Settings</h3>
        <p className="text-xs text-muted-foreground">Configure AI agent behavior, workflows, document processing, and infrastructure.</p>
      </div>

      <Tabs defaultValue="behavior" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border h-auto flex-wrap gap-0.5 p-1">
          <TabsTrigger value="behavior" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Bot className="h-3.5 w-3.5" /> Behavior
          </TabsTrigger>
          <TabsTrigger value="workflows" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Workflow className="h-3.5 w-3.5" /> Workflows
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Wrench className="h-3.5 w-3.5" /> Tools
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <FileText className="h-3.5 w-3.5" /> Prompts
          </TabsTrigger>
          <TabsTrigger value="infrastructure" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Database className="h-3.5 w-3.5" /> Infrastructure
          </TabsTrigger>
          <TabsTrigger value="limits" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Gauge className="h-3.5 w-3.5" /> Rate Limits
          </TabsTrigger>
        </TabsList>

        {/* Behavior */}
        <TabsContent value="behavior" className="space-y-4">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Default Behavior</CardTitle>
              <CardDescription className="text-xs">Control defaults for AI-powered workflows and research.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default Jurisdiction</Label>
                  <Select value={jurisdiction} onValueChange={setJurisdiction}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {JURISDICTIONS.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Citation Style</Label>
                  <Select value={citationStyle} onValueChange={setCitationStyle}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CITATION_STYLES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto Research</p>
                  <p className="text-xs text-muted-foreground">Automatically search when answering queries</p>
                </div>
                <Switch checked={autoResearch} onCheckedChange={setAutoResearch} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max Research Depth</Label>
                <Input type="number" min="1" max="10" value={maxDepth} onChange={e => setMaxDepth(e.target.value)} className="h-8 text-sm w-20" />
                <p className="text-[10px] text-muted-foreground">Number of recursive research steps (1-10)</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflows */}
        <TabsContent value="workflows" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Workflow Templates</p>
              <p className="text-xs text-muted-foreground">Configure workflows shown on the home page.</p>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={addWorkflow}>
              <Plus className="h-3 w-3" /> Add Workflow
            </Button>
          </div>

          {workflows.length === 0 && (
            <Card className="border border-dashed border-border">
              <CardContent className="py-8 text-center">
                <p className="text-xs text-muted-foreground">No workflows configured. Default workflows will be shown.</p>
              </CardContent>
            </Card>
          )}

          {workflows.map((wf) => (
            <Card key={wf.id} className="border border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{wf.title || "New Workflow"}</CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeWorkflow(wf.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input value={wf.title} onChange={e => updateWorkflow(wf.id, "title", e.target.value)} className="h-8 text-sm" placeholder="Draft a client alert" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Icon</Label>
                    <Select value={wf.icon} onValueChange={v => updateWorkflow(wf.id, "icon", v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WORKFLOW_ICONS.map(icon => <SelectItem key={icon} value={icon}>{icon}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Input value={wf.description} onChange={e => updateWorkflow(wf.id, "description", e.target.value)} className="h-8 text-sm" placeholder="Generate a structured legal alert..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Input value={wf.type} onChange={e => updateWorkflow(wf.id, "type", e.target.value)} className="h-8 text-sm" placeholder="Workflow" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Steps</Label>
                    <Input type="number" value={wf.steps} onChange={e => updateWorkflow(wf.id, "steps", parseInt(e.target.value) || 1)} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">System Prompt</Label>
                  <Textarea value={wf.systemPrompt} onChange={e => updateWorkflow(wf.id, "systemPrompt", e.target.value)} placeholder="Custom system prompt for this workflow..." rows={3} className="text-sm font-mono" />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Tools */}
        <TabsContent value="tools" className="space-y-4">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Document Analysis</CardTitle>
              </div>
              <CardDescription className="text-xs">Chunking and embedding settings for document processing.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Chunk Size (tokens)</Label>
                  <Input type="number" value={docChunkSize} onChange={e => setDocChunkSize(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Chunk Overlap</Label>
                  <Input type="number" value={docChunkOverlap} onChange={e => setDocChunkOverlap(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Embedding Model</Label>
                  <Select value={embeddingModel} onValueChange={setEmbeddingModel}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMBEDDING_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Red Flag Detection</CardTitle>
              </div>
              <CardDescription className="text-xs">Configure what the AI scans for in contract reviews.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Severity Threshold</Label>
                <Select value={redFlagThreshold} onValueChange={setRedFlagThreshold}>
                  <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (flag everything)</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High (critical only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Categories to scan</Label>
                <div className="grid grid-cols-2 gap-2">
                  {RED_FLAG_CATEGORY_OPTIONS.map((cat) => (
                    <div key={cat} className="flex items-center gap-2">
                      <Checkbox
                        id={`rf-${cat}`}
                        checked={redFlagCategories.includes(cat)}
                        onCheckedChange={() => {
                          setRedFlagCategories(prev =>
                            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
                          );
                        }}
                      />
                      <label htmlFor={`rf-${cat}`} className="text-xs cursor-pointer capitalize">
                        {cat.replace(/_/g, " ")}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompts */}
        <TabsContent value="prompts" className="space-y-4">
          <p className="text-xs text-muted-foreground">Customize system prompts per use case. Leave empty to use defaults.</p>
          {PROMPT_USE_CASES.map((uc) => {
            const promptValue = uc.id === "chat" ? chatPrompt : uc.id === "red_flags" ? redFlagPrompt : draftingPrompt;
            const setPrompt = uc.id === "chat" ? setChatPrompt : uc.id === "red_flags" ? setRedFlagPrompt : setDraftingPrompt;
            return (
              <Card key={uc.id} className="border border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <uc.icon className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">{uc.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={promptValue}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder={`System prompt for ${uc.label.toLowerCase()}...`}
                    rows={4}
                    className="text-sm font-mono"
                  />
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Infrastructure */}
        <TabsContent value="infrastructure" className="space-y-4">
          {/* OCR - Mistral */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">OCR — Mistral</CardTitle>
              </div>
              <CardDescription className="text-xs">Optical Character Recognition for PDFs and images using Mistral OCR. Returns markdown with preserved structure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mistral API Key</Label>
                <Input type="password" value={mistralApiKey} onChange={e => setMistralApiKey(e.target.value)} className="h-8 text-sm font-mono" placeholder="••••••••" />
                <p className="text-[10px] text-muted-foreground">Get your API key from <a href="https://console.mistral.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.mistral.ai</a></p>
              </div>
            </CardContent>
          </Card>

          {/* OpenAI Embeddings */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">OpenAI — Embeddings</CardTitle>
              </div>
              <CardDescription className="text-xs">API key for generating text embeddings (text-embedding-3-small).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">OpenAI API Key</Label>
                <Input type="password" value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)} className="h-8 text-sm font-mono" placeholder="sk-..." />
              </div>
            </CardContent>
          </Card>

          {/* Qdrant */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Qdrant — Vector Database</CardTitle>
              </div>
              <CardDescription className="text-xs">Store and search document embeddings for RAG retrieval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Qdrant URL</Label>
                  <Input value={qdrantUrl} onChange={e => setQdrantUrl(e.target.value)} className="h-8 text-sm font-mono" placeholder="https://your-cluster.qdrant.io:6333" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Qdrant API Key</Label>
                  <Input type="password" value={qdrantApiKey} onChange={e => setQdrantApiKey(e.target.value)} className="h-8 text-sm font-mono" placeholder="••••••••" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Collection Name Prefix</Label>
                <Input value={qdrantCollectionPrefix} onChange={e => setQdrantCollectionPrefix(e.target.value)} className="h-8 text-sm w-40" placeholder="org_" />
                <p className="text-[10px] text-muted-foreground">Collections will be named: {qdrantCollectionPrefix}{"<org_id>"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Limits */}
        <TabsContent value="limits" className="space-y-4">
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Rate Limits</CardTitle>
              <CardDescription className="text-xs">Control AI usage limits per organization and user.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Organization Daily Limit</Label>
                  <Input type="number" value={orgDailyLimit} onChange={e => setOrgDailyLimit(e.target.value)} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">Total AI calls per day for the organization</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Per-User Daily Limit</Label>
                  <Input type="number" value={userDailyLimit} onChange={e => setUserDailyLimit(e.target.value)} className="h-8 text-sm" />
                  <p className="text-[10px] text-muted-foreground">Max AI calls per user per day</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Global Save */}
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
