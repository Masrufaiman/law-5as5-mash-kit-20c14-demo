import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Power } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";

type LlmConfig = Tables<"llm_configs">;

interface LlmTabProps {
  orgId: string;
}

export function LlmTab({ orgId }: LlmTabProps) {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const { data } = await supabase.from("llm_configs").select("*").order("created_at");
    setConfigs(data || []);
    setLoading(false);
  };

  const toggleActive = async (config: LlmConfig) => {
    await supabase.from("llm_configs").update({ is_active: !config.is_active }).eq("id", config.id);
    loadConfigs();
  };

  const deleteConfig = async (id: string) => {
    await supabase.from("llm_configs").delete().eq("id", id);
    loadConfigs();
    toast({ title: "Deleted", description: "Provider removed." });
  };

  if (loading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">LLM Providers</h3>
          <p className="text-xs text-muted-foreground">Configure AI model providers for chat, analysis, and extraction.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Provider
        </Button>
      </div>

      {configs.length === 0 ? (
        <Card className="border border-border">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">No LLM providers configured.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {configs.map((config) => (
            <Card key={config.id} className="border border-border">
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-sm text-foreground">{config.display_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{config.provider} / {config.model_id}</p>
                  </div>
                  <Badge variant={config.is_active ? "default" : "secondary"} className="text-[10px]">
                    {config.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{config.use_case}</Badge>
                  {config.is_default && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(config)}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteConfig(config.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && <AddLlmForm orgId={orgId} onClose={() => { setShowAdd(false); loadConfigs(); }} />}
    </div>
  );
}

function AddLlmForm({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<string>("openai");
  const [modelId, setModelId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useCase, setUseCase] = useState<string>("chat");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { api_key_encrypted: encrypted, api_key_iv: iv } = await encryptApiKey(apiKey);
      const { error } = await supabase.from("llm_configs").insert({
        provider: provider as any,
        model_id: modelId,
        display_name: displayName,
        api_key_encrypted: encrypted,
        api_key_iv: iv,
        use_case: useCase as any,
        organization_id: orgId,
      });
      if (error) throw error;
      toast({ title: "Provider added", description: `${displayName} configured.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Add LLM Provider</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.llm_provider.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Use Case</Label>
            <Select value={useCase} onValueChange={setUseCase}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.llm_use_case.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Display Name</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="GPT-4o Chat" required className="h-8 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Model ID</Label>
            <Input value={modelId} onChange={e => setModelId(e.target.value)} placeholder="gpt-4o" required className="h-8 text-sm font-mono" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">API Key</Label>
            <Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." required className="h-8 text-sm" />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
