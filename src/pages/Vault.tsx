import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { FileCard } from "@/components/vault/FileCard";
import { FileUploadZone } from "@/components/vault/FileUploadZone";
import { VaultSkeleton } from "@/components/vault/VaultSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Grid3X3, List, Search, Plus } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type FileRow = Tables<"files">;
type VaultRow = Tables<"vaults">;

export default function Vault() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string>("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  // Load vaults
  useEffect(() => {
    if (!profile?.organization_id) return;
    const load = async () => {
      const { data } = await supabase
        .from("vaults")
        .select("*")
        .eq("organization_id", profile.organization_id!)
        .order("created_at");
      if (data?.length) {
        setVaults(data);
        setSelectedVaultId(data[0].id);
      }
      setLoading(false);
    };
    load();
  }, [profile?.organization_id]);

  // Load files for selected vault
  useEffect(() => {
    if (!selectedVaultId) return;
    const load = async () => {
      const { data } = await supabase
        .from("files")
        .select("*")
        .eq("vault_id", selectedVaultId)
        .order("created_at", { ascending: false });
      setFiles(data || []);
    };
    load();

    // Realtime subscription for file status changes
    const channel = supabase
      .channel(`files-${selectedVaultId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "files", filter: `vault_id=eq.${selectedVaultId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setFiles((prev) => [payload.new as FileRow, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setFiles((prev) => prev.map((f) => (f.id === (payload.new as FileRow).id ? (payload.new as FileRow) : f)));
          } else if (payload.eventType === "DELETE") {
            setFiles((prev) => prev.filter((f) => f.id !== (payload.old as any).id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedVaultId]);

  const handleUpload = async (fileList: File[]) => {
    if (!profile?.organization_id || !selectedVaultId) return;
    setUploading(true);

    for (const file of fileList) {
      const storagePath = `${profile.organization_id}/${selectedVaultId}/${crypto.randomUUID()}-${file.name}`;
      try {
        // Upload to storage
        const { error: storageError } = await supabase.storage
          .from("vault-files")
          .upload(storagePath, file);
        if (storageError) throw storageError;

        // Create file record
        const { error: dbError } = await supabase.from("files").insert({
          name: file.name,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: storagePath,
          vault_id: selectedVaultId,
          organization_id: profile.organization_id!,
          uploaded_by: profile.id,
          status: "processing",
        });
        if (dbError) throw dbError;

        toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }
    setUploading(false);
  };

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <AppLayout>
        <VaultSkeleton />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <FileUploadZone onFilesSelected={handleUpload}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-xl font-semibold text-foreground">Vault</h1>
              {vaults.length > 1 && (
                <Select value={selectedVaultId} onValueChange={setSelectedVaultId}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vaults.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.doc,.xlsx,.txt,.md"
                onChange={(e) => {
                  if (e.target.files?.length) handleUpload(Array.from(e.target.files));
                  e.target.value = "";
                }}
              />
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="px-6 py-3 border-b border-border">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* File Grid/List */}
          <div className="flex-1 overflow-auto p-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground">No files yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Drag & drop files or click Upload to get started
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((file) => (
                  <FileCard key={file.id} file={file} />
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((file) => (
                  <FileCard key={file.id} file={file} />
                ))}
              </div>
            )}
          </div>
        </div>
      </FileUploadZone>
    </AppLayout>
  );
}
