import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Bot } from "lucide-react";

const JURISDICTIONS = ["United States", "United Kingdom", "European Union", "Australia", "Canada", "India"];
const CITATION_STYLES = ["Bluebook", "OSCOLA", "AGLC", "McGill", "APA Legal", "Chicago"];
const AGENT_TOOLS = [
  { id: "web_search", label: "Web Search" },
  { id: "deep_research", label: "Deep Research" },
  { id: "document_analysis", label: "Document Analysis" },
  { id: "red_flag_detection", label: "Red Flag Detection" },
  { id: "contract_drafting", label: "Contract Drafting" },
  { id: "citation_lookup", label: "Citation Lookup" },
];

interface AgentTabProps {
  orgId: string;
}

export function AgentTab({ orgId }: AgentTabProps) {
  const { toast } = useToast();
  const [existingId, setExistingId] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState("United States");
  const [autoResearch, setAutoResearch] = useState(true);
  const [citationStyle, setCitationStyle] = useState("Bluebook");
  const [maxDepth, setMaxDepth] = useState("3");
  const [allowedTools, setAllowedTools] = useState<string[]>(AGENT_TOOLS.map(t => t.id));
  const [saving, setSaving] = useState(false);

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
          const config = (data.config as any) || {};
          setJurisdiction(config.default_jurisdiction || "United States");
          setAutoResearch(config.auto_research ?? true);
          setCitationStyle(config.citation_style || "Bluebook");
          setMaxDepth(String(config.max_research_depth || 3));
          setAllowedTools(config.allowed_tools || AGENT_TOOLS.map(t => t.id));
        }
      });
  }, [orgId]);

  const toggleTool = (toolId: string) => {
    setAllowedTools(prev =>
      prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        default_jurisdiction: jurisdiction,
        auto_research: autoResearch,
        citation_style: citationStyle,
        max_research_depth: parseInt(maxDepth),
        allowed_tools: allowedTools,
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Agentic AI Settings</h3>
        <p className="text-xs text-muted-foreground">Configure how AI agents behave across your organization.</p>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Agent Behavior</CardTitle>
          </div>
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
            <Input
              type="number"
              min="1"
              max="10"
              value={maxDepth}
              onChange={e => setMaxDepth(e.target.value)}
              className="h-8 text-sm w-20"
            />
            <p className="text-[10px] text-muted-foreground">Number of recursive research steps (1-10)</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Allowed Agent Tools</Label>
            <div className="grid grid-cols-2 gap-2">
              {AGENT_TOOLS.map(tool => (
                <div key={tool.id} className="flex items-center gap-2">
                  <Checkbox
                    id={tool.id}
                    checked={allowedTools.includes(tool.id)}
                    onCheckedChange={() => toggleTool(tool.id)}
                  />
                  <label htmlFor={tool.id} className="text-xs text-foreground cursor-pointer">{tool.label}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
