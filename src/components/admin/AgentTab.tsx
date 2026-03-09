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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Bot, Wrench, FileText, Gauge, Search, Brain, Scale, AlertTriangle, PenTool, BookOpen } from "lucide-react";

const JURISDICTIONS = ["United States", "United Kingdom", "European Union", "Australia", "Canada", "India", "Singapore", "Hong Kong"];
const CITATION_STYLES = ["Bluebook", "OSCOLA", "AGLC", "McGill", "APA Legal", "Chicago"];
const SEARCH_PROVIDERS = ["tavily", "perplexity"];
const DEEP_RESEARCH_MODELS = ["sonar-reasoning", "sonar-pro", "gpt-4o", "claude-sonnet-4"];
const EMBEDDING_MODELS = ["text-embedding-3-small", "text-embedding-3-large", "text-embedding-ada-002"];

const PROMPT_USE_CASES = [
  { id: "chat", label: "Chat / Research", icon: Brain },
  { id: "red_flags", label: "Red Flag Detection", icon: AlertTriangle },
  { id: "tables", label: "Review Tables", icon: Scale },
  { id: "drafting", label: "Document Drafting", icon: PenTool },
];

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

  // Tool configs
  const [webSearchProvider, setWebSearchProvider] = useState("tavily");
  const [webSearchApiKey, setWebSearchApiKey] = useState("");
  const [webSearchCacheTtl, setWebSearchCacheTtl] = useState("3600");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);

  const [deepResearchEnabled, setDeepResearchEnabled] = useState(true);
  const [deepResearchModel, setDeepResearchModel] = useState("sonar-reasoning");
  const [deepResearchMaxIterations, setDeepResearchMaxIterations] = useState("5");

  const [docChunkSize, setDocChunkSize] = useState("1000");
  const [docChunkOverlap, setDocChunkOverlap] = useState("200");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");

  const [redFlagThreshold, setRedFlagThreshold] = useState("medium");
  const [redFlagCategories, setRedFlagCategories] = useState<string[]>([
    "liability", "indemnity", "termination", "ip_assignment", "non_compete", "data_privacy",
  ]);

  const [draftingJurisdiction, setDraftingJurisdiction] = useState("United States");
  const [citationDatabases, setCitationDatabases] = useState<string[]>(["westlaw", "lexis"]);

  // Prompt templates
  const [chatPrompt, setChatPrompt] = useState("");
  const [redFlagPrompt, setRedFlagPrompt] = useState("");
  const [tablePrompt, setTablePrompt] = useState("");
  const [draftingPrompt, setDraftingPrompt] = useState("");

  // Rate limits
  const [orgDailyLimit, setOrgDailyLimit] = useState("1000");
  const [userDailyLimit, setUserDailyLimit] = useState("100");

  // Tavily
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [tavilySearchDepth, setTavilySearchDepth] = useState("advanced");
  const [tavilyMaxResults, setTavilyMaxResults] = useState("5");

  useEffect(() => {
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
          // Tools
          setWebSearchProvider(c.web_search?.provider || "tavily");
          setWebSearchApiKey(c.web_search?.api_key || "");
          setWebSearchCacheTtl(String(c.web_search?.cache_ttl || 3600));
          setWebSearchEnabled(c.web_search?.enabled ?? true);
          setDeepResearchEnabled(c.deep_research?.enabled ?? true);
          setDeepResearchModel(c.deep_research?.model || "sonar-reasoning");
          setDeepResearchMaxIterations(String(c.deep_research?.max_iterations || 5));
          setDocChunkSize(String(c.document_analysis?.chunk_size || 1000));
          setDocChunkOverlap(String(c.document_analysis?.chunk_overlap || 200));
          setEmbeddingModel(c.document_analysis?.embedding_model || "text-embedding-3-small");
          setRedFlagThreshold(c.red_flag?.severity_threshold || "medium");
          setRedFlagCategories(c.red_flag?.categories || redFlagCategories);
          setDraftingJurisdiction(c.drafting?.jurisdiction || "United States");
          setCitationDatabases(c.citation?.databases || ["westlaw", "lexis"]);
          // Prompts
          setChatPrompt(c.prompts?.chat || "");
          setRedFlagPrompt(c.prompts?.red_flags || "");
          setTablePrompt(c.prompts?.tables || "");
          setDraftingPrompt(c.prompts?.drafting || "");
          // Limits
          setOrgDailyLimit(String(c.rate_limits?.org_daily || 1000));
          setUserDailyLimit(String(c.rate_limits?.user_daily || 100));
          // Tavily
          setTavilyApiKey(c.tavily?.api_key || "");
          setTavilySearchDepth(c.tavily?.search_depth || "advanced");
          setTavilyMaxResults(String(c.tavily?.max_results || 5));
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
        web_search: {
          provider: webSearchProvider,
          api_key: webSearchApiKey,
          cache_ttl: parseInt(webSearchCacheTtl),
          enabled: webSearchEnabled,
        },
        deep_research: {
          enabled: deepResearchEnabled,
          model: deepResearchModel,
          max_iterations: parseInt(deepResearchMaxIterations),
        },
        document_analysis: {
          chunk_size: parseInt(docChunkSize),
          chunk_overlap: parseInt(docChunkOverlap),
          embedding_model: embeddingModel,
        },
        red_flag: {
          severity_threshold: redFlagThreshold,
          categories: redFlagCategories,
        },
        drafting: {
          jurisdiction: draftingJurisdiction,
        },
        citation: {
          databases: citationDatabases,
          format_style: citationStyle,
        },
        prompts: {
          chat: chatPrompt,
          red_flags: redFlagPrompt,
          tables: tablePrompt,
          drafting: draftingPrompt,
        },
        rate_limits: {
          org_daily: parseInt(orgDailyLimit),
          user_daily: parseInt(userDailyLimit),
        },
        tavily: {
          api_key: tavilyApiKey,
          search_depth: tavilySearchDepth,
          max_results: parseInt(tavilyMaxResults),
        },
      };

      const payload = {
        name: "Agent Configuration",
        provider: "agent_config",
        organization_id: orgId,
        config,
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

  const RED_FLAG_CATEGORY_OPTIONS = [
    "liability", "indemnity", "termination", "ip_assignment", "non_compete",
    "data_privacy", "governing_law", "limitation_of_liability", "confidentiality", "warranty",
  ];

  const CITATION_DB_OPTIONS = [
    { id: "westlaw", label: "Westlaw" },
    { id: "lexis", label: "LexisNexis" },
    { id: "google_scholar", label: "Google Scholar" },
    { id: "courtlistener", label: "CourtListener" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Agentic AI Settings</h3>
        <p className="text-xs text-muted-foreground">Configure AI agent behavior, tools, prompt templates, and rate limits.</p>
      </div>

      <Tabs defaultValue="behavior" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border h-auto flex-wrap gap-0.5 p-1">
          <TabsTrigger value="behavior" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Bot className="h-3.5 w-3.5" /> Behavior
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Wrench className="h-3.5 w-3.5" /> Tools
          </TabsTrigger>
          <TabsTrigger value="prompts" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <FileText className="h-3.5 w-3.5" /> Prompts
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

        {/* Tools */}
        <TabsContent value="tools" className="space-y-4">
          {/* Web Search */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Web Search</CardTitle>
                </div>
                <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} />
              </div>
              <CardDescription className="text-xs">Real-time web search for legal research and fact-finding.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Provider</Label>
                  <Select value={webSearchProvider} onValueChange={setWebSearchProvider}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEARCH_PROVIDERS.map(p => <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  <Input value={webSearchApiKey} onChange={e => setWebSearchApiKey(e.target.value)} type="password" className="h-8 text-sm font-mono" placeholder="sk-..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cache TTL (seconds)</Label>
                  <Input type="number" value={webSearchCacheTtl} onChange={e => setWebSearchCacheTtl(e.target.value)} className="h-8 text-sm w-full" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Deep Research */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm">Deep Research</CardTitle>
                </div>
                <Switch checked={deepResearchEnabled} onCheckedChange={setDeepResearchEnabled} />
              </div>
              <CardDescription className="text-xs">Multi-step research with iterative reasoning for complex queries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <Select value={deepResearchModel} onValueChange={setDeepResearchModel}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEEP_RESEARCH_MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Iterations</Label>
                  <Input type="number" min="1" max="20" value={deepResearchMaxIterations} onChange={e => setDeepResearchMaxIterations(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Document Analysis */}
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

          {/* Red Flag Detection */}
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

          {/* Citation Lookup removed — citations come from user docs, KB, and legal APIs */}

          {/* Tavily */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm">Tavily API</CardTitle>
              </div>
              <CardDescription className="text-xs">Dedicated search API configuration for Tavily.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">API Key</Label>
                  <Input value={tavilyApiKey} onChange={e => setTavilyApiKey(e.target.value)} type="password" className="h-8 text-sm font-mono" placeholder="tvly-..." />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Search Depth</Label>
                  <Select value={tavilySearchDepth} onValueChange={setTavilySearchDepth}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Results</Label>
                  <Input type="number" min="1" max="20" value={tavilyMaxResults} onChange={e => setTavilyMaxResults(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompts */}
        <TabsContent value="prompts" className="space-y-4">
          <p className="text-xs text-muted-foreground">Customize system prompts per use case. Leave empty to use defaults.</p>
          {PROMPT_USE_CASES.map((uc) => {
            const promptValue = uc.id === "chat" ? chatPrompt : uc.id === "red_flags" ? redFlagPrompt : uc.id === "tables" ? tablePrompt : draftingPrompt;
            const setPrompt = uc.id === "chat" ? setChatPrompt : uc.id === "red_flags" ? setRedFlagPrompt : uc.id === "tables" ? setTablePrompt : setDraftingPrompt;
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
