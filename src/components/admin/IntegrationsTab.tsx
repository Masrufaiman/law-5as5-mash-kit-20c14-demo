import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Plug } from "lucide-react";

interface Integration {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

interface IntegrationsTabProps {
  orgId: string;
}

export function IntegrationsTab({ orgId }: IntegrationsTabProps) {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProvider, setNewProvider] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("api_integrations")
      .select("id, name, provider, is_active")
      .eq("organization_id", orgId)
      .not("provider", "in", '("perplexity","cloudflare_r2","agent_config")')
      .order("created_at");
    setIntegrations(data || []);
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("api_integrations").update({ is_active: !current }).eq("id", id);
    load();
  };

  const deleteIntegration = async (id: string) => {
    await supabase.from("api_integrations").delete().eq("id", id);
    load();
    toast({ title: "Deleted" });
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newProvider.trim()) return;
    setSaving(true);
    try {
      const payload: any = {
        name: newName,
        provider: newProvider,
        organization_id: orgId,
        is_active: true,
      };
      if (newApiKey) {
        const { api_key_encrypted, api_key_iv } = await encryptApiKey(newApiKey);
        payload.api_key_encrypted = api_key_encrypted;
        payload.api_key_iv = api_key_iv;
      }
      const { error } = await supabase.from("api_integrations").insert(payload);
      if (error) throw error;
      toast({ title: "Added", description: `${newName} integration configured.` });
      setShowAdd(false);
      setNewName(""); setNewProvider(""); setNewApiKey("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">External Integrations</h3>
          <p className="text-xs text-muted-foreground">Connect third-party legal and research services.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Integration
        </Button>
      </div>

      {integrations.length === 0 && !showAdd ? (
        <Card className="border border-border">
          <CardContent className="py-8 text-center">
            <Plug className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No external integrations configured.</p>
            <p className="text-xs text-muted-foreground mt-1">Add LexisNexis, iManage, or other services.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {integrations.map((int) => (
            <Card key={int.id} className="border border-border">
              <CardContent className="flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <p className="font-medium text-sm text-foreground">{int.name}</p>
                  <Badge variant="outline" className="text-[10px] font-mono">{int.provider}</Badge>
                  <Badge variant={int.is_active ? "default" : "secondary"} className="text-[10px]">
                    {int.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={int.is_active} onCheckedChange={() => toggleActive(int.id, int.is_active)} />
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteIntegration(int.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <Card className="border border-border">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Add Integration</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="LexisNexis" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Provider</Label>
                <Input value={newProvider} onChange={e => setNewProvider(e.target.value)} placeholder="lexisnexis" className="h-8 text-sm font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">API Key (optional)</Label>
              <Input type="password" value={newApiKey} onChange={e => setNewApiKey(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? "Saving..." : "Add"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
