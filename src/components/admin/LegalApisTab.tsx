import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { encryptApiKey } from "@/lib/encryptApiKey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Scale, Landmark, FileText, ExternalLink } from "lucide-react";

interface LegalApisTabProps {
  orgId: string;
}

interface LegalApiConfig {
  id?: string;
  provider: string;
  name: string;
  is_active: boolean;
  hasKey: boolean;
  config: Record<string, any>;
}

const LEGAL_APIS = [
  {
    provider: "courtlistener",
    name: "CourtListener",
    description: "Free US case law database. API key enables higher rate limits and full-text search.",
    icon: Landmark,
    requiresKey: true,
    keyLabel: "API Token",
    keyHint: "Get your token at courtlistener.com/help/api",
    docsUrl: "https://www.courtlistener.com/help/api/rest/",
    configFields: [],
  },
  {
    provider: "edgar",
    name: "EDGAR (SEC)",
    description: "SEC filings and company disclosures. Free API — requires a User-Agent identifier.",
    icon: FileText,
    requiresKey: false,
    configFields: [
      { key: "user_agent", label: "User-Agent", placeholder: "LawKit/1.0 contact@yourfirm.com", hint: "SEC requires a company name and email" },
    ],
    docsUrl: "https://www.sec.gov/search#/dateRange=custom",
  },
  {
    provider: "eurlex",
    name: "EUR-Lex",
    description: "European Union legislation, case law, and treaties. Free — no API key required.",
    icon: Scale,
    requiresKey: false,
    configFields: [],
    docsUrl: "https://eur-lex.europa.eu/",
  },
];

export function LegalApisTab({ orgId }: LegalApisTabProps) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<Record<string, LegalApiConfig>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [configValues, setConfigValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("api_integrations")
      .select("id, name, provider, is_active, config, api_key_encrypted")
      .eq("organization_id", orgId)
      .in("provider", ["courtlistener", "edgar", "eurlex"]);

    const map: Record<string, LegalApiConfig> = {};
    const cfgVals: Record<string, Record<string, string>> = {};
    (data || []).forEach((row: any) => {
      map[row.provider] = {
        id: row.id,
        provider: row.provider,
        name: row.name,
        is_active: row.is_active,
        hasKey: !!row.api_key_encrypted,
        config: row.config || {},
      };
      cfgVals[row.provider] = row.config || {};
    });
    setConfigs(map);
    setConfigValues(cfgVals);
  };

  const handleSave = async (provider: string) => {
    const api = LEGAL_APIS.find(a => a.provider === provider)!;
    setSaving(s => ({ ...s, [provider]: true }));
    try {
      const existing = configs[provider];
      const payload: any = {
        name: api.name,
        provider,
        organization_id: orgId,
        is_active: existing?.is_active ?? true,
        config: configValues[provider] || {},
      };

      const key = apiKeys[provider];
      if (key) {
        const { api_key_encrypted, api_key_iv } = await encryptApiKey(key);
        payload.api_key_encrypted = api_key_encrypted;
        payload.api_key_iv = api_key_iv;
      }

      if (existing?.id) {
        const { error } = await supabase.from("api_integrations").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        if (!key && api.requiresKey) {
          payload.api_key_encrypted = null;
          payload.api_key_iv = null;
        }
        const { error } = await supabase.from("api_integrations").insert(payload);
        if (error) throw error;
      }

      toast({ title: "Saved", description: `${api.name} configuration updated.` });
      setApiKeys(k => ({ ...k, [provider]: "" }));
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(s => ({ ...s, [provider]: false }));
    }
  };

  const toggleActive = async (provider: string) => {
    const existing = configs[provider];
    if (!existing?.id) return;
    await supabase.from("api_integrations").update({ is_active: !existing.is_active }).eq("id", existing.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold text-foreground">Legal Research APIs</h3>
        <p className="text-xs text-muted-foreground">Connect to legal databases for case law, SEC filings, and EU legislation.</p>
      </div>

      <div className="grid gap-4">
        {LEGAL_APIS.map((api) => {
          const cfg = configs[api.provider];
          const Icon = api.icon;
          const isSaving = saving[api.provider];

          return (
            <Card key={api.provider} className="border border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-semibold text-foreground">{api.name}</CardTitle>
                    {cfg?.id && (
                      <Badge variant={cfg.is_active ? "default" : "secondary"} className="text-[10px]">
                        {cfg.is_active ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {api.docsUrl && (
                      <a href={api.docsUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {cfg?.id && (
                      <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive(api.provider)} />
                    )}
                  </div>
                </div>
                <CardDescription className="text-xs">{api.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {api.requiresKey && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{api.keyLabel || "API Key"}</Label>
                    <Input
                      type="password"
                      value={apiKeys[api.provider] || ""}
                      onChange={e => setApiKeys(k => ({ ...k, [api.provider]: e.target.value }))}
                      placeholder={cfg?.hasKey ? "••••••••  (key saved)" : api.keyHint || "Enter API key"}
                      className="h-8 text-sm font-mono"
                    />
                    {api.keyHint && <p className="text-[10px] text-muted-foreground">{api.keyHint}</p>}
                  </div>
                )}

                {api.configFields?.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      value={configValues[api.provider]?.[field.key] || ""}
                      onChange={e => setConfigValues(cv => ({
                        ...cv,
                        [api.provider]: { ...(cv[api.provider] || {}), [field.key]: e.target.value },
                      }))}
                      placeholder={field.placeholder}
                      className="h-8 text-sm"
                    />
                    {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
                  </div>
                ))}

                <div className="flex justify-end">
                  <Button size="sm" onClick={() => handleSave(api.provider)} disabled={isSaving}>
                    {isSaving ? "Saving..." : cfg?.id ? "Update" : "Enable"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
