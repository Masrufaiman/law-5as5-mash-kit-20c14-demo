import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { HardDrive } from "lucide-react";

interface StorageTabProps {
  orgId: string;
}

export function StorageTab({ orgId }: StorageTabProps) {
  const { toast } = useToast();
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("api_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "cloudflare_r2")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          const config = (data.config as any) || {};
          setAccountId(config.account_id || "");
          setBucketName(config.bucket_name || "");
          setPublicUrl(config.public_url || "");
          if (data.api_key_encrypted) {
            setAccessKeyId("••••••••");
            setSecretAccessKey("••••••••");
          }
        }
      });
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = { account_id: accountId, bucket_name: bucketName, public_url: publicUrl };
      const payload: any = {
        name: "Cloudflare R2",
        provider: "cloudflare_r2",
        organization_id: orgId,
        config,
        is_active: true,
      };

      if (accessKeyId && !accessKeyId.startsWith("••")) {
        payload.api_key_encrypted = btoa(JSON.stringify({ access_key_id: accessKeyId, secret_access_key: secretAccessKey }));
        payload.api_key_iv = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
      }

      if (existingId) {
        const { error } = await supabase.from("api_integrations").update(payload).eq("id", existingId);
        if (error) throw error;
      } else {
        if (!accessKeyId || accessKeyId.startsWith("••")) throw new Error("Credentials required");
        const { error, data } = await supabase.from("api_integrations").insert(payload).select().single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast({ title: "Saved", description: "R2 storage configured." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Storage Configuration</h3>
        <p className="text-xs text-muted-foreground">Configure Cloudflare R2 for external file storage.</p>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Cloudflare R2</CardTitle>
          </div>
          <CardDescription className="text-xs">S3-compatible object storage with zero egress fees.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Account ID</Label>
              <Input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="cf-account-id" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bucket Name</Label>
              <Input value={bucketName} onChange={e => setBucketName(e.target.value)} placeholder="lawkit-files" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Access Key ID</Label>
              <Input type="password" value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secret Access Key</Label>
              <Input type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Public URL (optional)</Label>
            <Input value={publicUrl} onChange={e => setPublicUrl(e.target.value)} placeholder="https://files.lawkit.ai" className="h-8 text-sm" />
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
