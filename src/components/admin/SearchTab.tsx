import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Sparkles } from "lucide-react";

const PERPLEXITY_MODELS = [
  { id: "sonar", label: "Sonar — fast search" },
  { id: "sonar-pro", label: "Sonar Pro — 2x citations" },
  { id: "sonar-reasoning", label: "Sonar Reasoning — chain-of-thought" },
  { id: "sonar-reasoning-pro", label: "Sonar Reasoning Pro — DeepSeek R1" },
  { id: "sonar-deep-research", label: "Sonar Deep Research — multi-query" },
];

interface SearchTabProps {
  orgId: string;
}

export function SearchTab({ orgId }: SearchTabProps) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("sonar");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("api_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "perplexity")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setApiKey(data.api_key_encrypted ? "••••••••" : "");
          const config = (data.config as any) || {};
          setModel(config.model || "sonar");
          setWebSearchEnabled(config.web_search_enabled ?? false);
          setDeepResearchEnabled(config.deep_research_enabled ?? false);
        }
      });
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        model,
        web_search_enabled: webSearchEnabled,
        deep_research_enabled: deepResearchEnabled,
      };

      const payload: any = {
        name: "Perplexity Search",
        provider: "perplexity",
        organization_id: orgId,
        config,
        is_active: true,
      };

      if (apiKey && !apiKey.startsWith("••")) {
        payload.api_key_encrypted = btoa(apiKey);
        payload.api_key_iv = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
      }

      if (existingId) {
        const { error } = await supabase.from("api_integrations").update(payload).eq("id", existingId);
        if (error) throw error;
      } else {
        if (!apiKey || apiKey.startsWith("••")) throw new Error("API key required");
        const { error, data } = await supabase.from("api_integrations").insert(payload).select().single();
        if (error) throw error;
        setExistingId(data.id);
      }

      toast({ title: "Saved", description: "Search config updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Search & Research APIs</h3>
        <p className="text-xs text-muted-foreground">Configure web search and deep research for AI-powered legal research.</p>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Perplexity AI</CardTitle>
          </div>
          <CardDescription className="text-xs">Web search with grounded citations for legal research.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="pplx-..."
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Default Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERPLEXITY_MODELS.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-foreground">Web Search</p>
              <p className="text-xs text-muted-foreground">Enable real-time web search in chat</p>
            </div>
            <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} />
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">Deep Research</p>
                <p className="text-xs text-muted-foreground">Multi-step reasoning with extensive analysis</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">Premium</Badge>
            </div>
            <Switch checked={deepResearchEnabled} onCheckedChange={setDeepResearchEnabled} />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
