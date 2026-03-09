import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { HardDrive, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

const R2_REGIONS = [
  { value: "auto", label: "Automatic" },
  { value: "wnam", label: "Western North America" },
  { value: "enam", label: "Eastern North America" },
  { value: "weur", label: "Western Europe" },
  { value: "eeur", label: "Eastern Europe" },
  { value: "apac", label: "Asia Pacific" },
];

interface StorageTabProps {
  orgId: string;
}

export function StorageTab({ orgId }: StorageTabProps) {
  const { toast } = useToast();
  const [existingId, setExistingId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [bucketName, setBucketName] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [region, setRegion] = useState("auto");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  const [fileCount, setFileCount] = useState(0);
  const [totalSize, setTotalSize] = useState(0);

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
          setAccessKeyId(config.access_key_id || "");
          setSecretAccessKey(config.secret_access_key || "");
          setBucketName(config.bucket_name || "");
          setPublicUrl(config.public_url || "");
          setEndpointUrl(config.endpoint_url || "");
          setRegion(config.region || "auto");
        }
      });

    supabase
      .from("files")
      .select("size_bytes", { count: "exact" })
      .eq("organization_id", orgId)
      .then(({ data, count }) => {
        setFileCount(count || 0);
        const total = (data || []).reduce((sum, f) => sum + (f.size_bytes || 0), 0);
        setTotalSize(total);
      });
  }, [orgId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = {
        account_id: accountId,
        access_key_id: accessKeyId,
        secret_access_key: secretAccessKey,
        bucket_name: bucketName,
        public_url: publicUrl,
        endpoint_url: endpointUrl || `https://${accountId}.r2.cloudflarestorage.com`,
        region,
      };
      const payload = {
        name: "Cloudflare R2",
        provider: "cloudflare_r2",
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
      toast({ title: "Saved", description: "R2 configuration updated." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/r2-upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "test_connection", orgId }),
        }
      );
      if (response.ok) {
        setTestResult("success");
        toast({ title: "Connected", description: "R2 connection successful." });
      } else {
        setTestResult("error");
        const err = await response.json();
        toast({ title: "Connection failed", description: err.error || "Unable to connect", variant: "destructive" });
      }
    } catch {
      setTestResult("error");
      toast({ title: "Connection failed", description: "Network error", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Storage — Cloudflare R2</h3>
        <p className="text-xs text-muted-foreground">All files in LawKit are stored exclusively in Cloudflare R2.</p>
      </div>

      <Card className="border border-border">
        <CardContent className="py-4 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-primary">
              <HardDrive className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Storage Usage</p>
              <p className="text-xs text-muted-foreground">Current files and storage across all vaults</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-lg font-mono font-semibold text-foreground">{fileCount}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Files</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-mono font-semibold text-foreground">{formatBytes(totalSize)}</p>
                <p className="text-[10px] text-muted-foreground uppercase">Total Size</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2.5 p-3 rounded-md border border-border bg-muted/30">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-foreground">R2-Only Storage Architecture</p>
          <p className="text-[10px] text-muted-foreground">
            LawKit never stores files in Supabase. All uploads go directly to your Cloudflare R2 bucket.
          </p>
        </div>
      </div>

      <Card className="border border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">R2 Credentials</CardTitle>
          <CardDescription className="text-xs">
            Get your R2 API tokens from Cloudflare dashboard → R2 → Manage R2 API Tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Account ID</Label>
              <Input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="Cloudflare Account ID" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bucket Name</Label>
              <Input value={bucketName} onChange={(e) => setBucketName(e.target.value)} placeholder="lawkit-files" className="h-8 text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Access Key ID</Label>
              <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="R2 Access Key ID" className="h-8 text-sm font-mono" type="password" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secret Access Key</Label>
              <Input value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} placeholder="R2 Secret Access Key" className="h-8 text-sm font-mono" type="password" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint URL (optional)</Label>
              <Input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder={`https://${accountId || '<account_id>'}.r2.cloudflarestorage.com`} className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-muted-foreground">Auto-generated from Account ID if empty</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Public URL (optional)</Label>
              <Input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://files.yourdomain.com" className="h-8 text-sm font-mono" />
              <p className="text-[10px] text-muted-foreground">Custom domain for public file access</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-8 text-sm w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {R2_REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !accountId}>
              {testing ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : "Test Connection"}
            </Button>
            {testResult === "success" && (
              <Badge variant="default" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>
            )}
            {testResult === "error" && (
              <Badge variant="destructive" className="gap-1 text-xs"><AlertCircle className="h-3 w-3" /> Failed</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
