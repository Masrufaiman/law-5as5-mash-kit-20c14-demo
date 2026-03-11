import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Zap, Brain, BookOpen, FlaskConical } from "lucide-react";

const MODEL_USE_CASES = [
  { model: "sonar", label: "Sonar", icon: Zap, useCase: "Chat & Research", description: "Fast search, good citations. Used for every regular chat query.", badge: "Default" },
  { model: "sonar-reasoning", label: "Sonar Reasoning", icon: Brain, useCase: "Red Flag Detection", description: "Chain-of-thought reasoning for contract risk analysis and compliance checks.", badge: "Auto" },
  { model: "sonar-pro", label: "Sonar Pro", icon: BookOpen, useCase: "Review Tables", description: "2× more citations for extraction, comparisons, and structured data.", badge: "Auto" },
  { model: "sonar-deep-research", label: "Sonar Deep Research", icon: FlaskConical, useCase: "Deep Research", description: "Multi-query expert research. Triggered by user toggle only.", badge: "Manual" },
];

interface SearchTabProps {
  orgId: string;
}

export function SearchTab({ orgId }: SearchTabProps) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
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
          setWebSearchEnabled(config.web_search_enabled ?? false);
          setDeepResearchEnabled(config.deep_research_enabled ?? false);
        }
      });
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
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
        const { api_key_encrypted, api_key_iv } = await encryptApiKey(apiKey);
        payload.api_key_encrypted = api_key_encrypted;
        payload.api_key_iv = api_key_iv;
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
        <p className="text-xs text-muted-foreground">Perplexity powers all search and research. Models are selected automatically based on task type.</p>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Perplexity AI</CardTitle>
          </div>
          <CardDescription className="text-xs">Single API key — 4 models used automatically per task.</CardDescription>
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

          {/* Model Use-Case Mapping (read-only info) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Model Routing</Label>
            <div className="space-y-2">
              {MODEL_USE_CASES.map((m) => (
                <div key={m.model} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
                  <m.icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{m.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{m.badge}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m.useCase} — {m.description}</p>
                  </div>
                </div>
              ))}
            </div>
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
