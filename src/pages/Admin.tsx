import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Shield } from "lucide-react";
import { Navigate } from "react-router-dom";
import type { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";

type LlmConfig = Tables<"llm_configs">;

export default function Admin() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<LlmConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
  if (!isAdmin) return <Navigate to="/" replace />;

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    const { data } = await supabase.from("llm_configs").select("*").order("created_at");
    setConfigs(data || []);
    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="h-full overflow-auto">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-xl font-semibold">Admin Panel</h1>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add LLM Provider
          </Button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <h2 className="font-heading text-lg font-semibold mb-4">LLM Configurations</h2>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-lg" />
                ))}
              </div>
            ) : configs.length === 0 ? (
              <Card className="border border-border shadow-none">
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No LLM providers configured yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">Add a provider to enable AI features.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {configs.map((config) => (
                  <Card key={config.id} className="border border-border shadow-none">
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium text-foreground">{config.display_name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{config.provider} / {config.model_id}</p>
                        </div>
                        <Badge variant={config.is_active ? "default" : "secondary"}>
                          {config.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{config.use_case}</Badge>
                      </div>
                      {config.is_default && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {showAdd && <AddLlmForm onClose={() => { setShowAdd(false); loadConfigs(); }} />}
        </div>
      </div>
    </AppLayout>
  );
}

function AddLlmForm({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
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
      // For now, store a placeholder encrypted key — real encryption via edge function later
      const encoder = new TextEncoder();
      const keyData = encoder.encode(apiKey);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = btoa(String.fromCharCode(...new Uint8Array(keyData)));
      const ivStr = btoa(String.fromCharCode(...iv));

      const { error } = await supabase.from("llm_configs").insert({
        provider: provider as any,
        model_id: modelId,
        display_name: displayName,
        api_key_encrypted: encrypted,
        api_key_iv: ivStr,
        use_case: useCase as any,
        organization_id: profile?.organization_id,
      });

      if (error) throw error;
      toast({ title: "Provider added", description: `${displayName} has been configured.` });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-border shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">Add LLM Provider</CardTitle>
        <CardDescription>Configure an AI model for your organization.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.llm_provider.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Use Case</Label>
            <Select value={useCase} onValueChange={setUseCase}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.llm_use_case.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Display Name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. GPT-4o Chat" required />
          </div>
          <div className="space-y-2">
            <Label>Model ID</Label>
            <Input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="e.g. gpt-4o" required className="font-mono" />
          </div>
          <div className="col-span-2 space-y-2">
            <Label>API Key</Label>
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." required />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving..." : "Save Provider"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
