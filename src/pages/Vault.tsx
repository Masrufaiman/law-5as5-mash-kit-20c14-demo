import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { VaultGrid } from "@/components/vault/VaultGrid";
import { VaultDetail } from "@/components/vault/VaultDetail";
import { FileUploadZone } from "@/components/vault/FileUploadZone";
import { VaultSkeleton } from "@/components/vault/VaultSkeleton";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type FileRow = Tables<"files">;
type VaultRow = Tables<"vaults">;

export default function Vault() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({});
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(searchParams.get("vault"));
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const selectedVault = vaults.find((v) => v.id === selectedVaultId);

  // Load vaults
  useEffect(() => {
    if (!profile?.organization_id) return;
    const load = async () => {
      const { data } = await supabase
        .from("vaults")
        .select("*")
        .eq("organization_id", profile.organization_id!)
        .order("created_at");
      setVaults(data || []);

      if (data?.length) {
        const counts: Record<string, number> = {};
        for (const v of data) {
          const { count } = await supabase
            .from("files")
            .select("*", { count: "exact", head: true })
            .eq("vault_id", v.id);
          counts[v.id] = count || 0;
        }
        setFileCounts(counts);
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

  const handleSelectVault = (id: string) => {
    setSelectedVaultId(id);
    setSearchParams({ vault: id });
  };

  const handleBack = () => {
    setSelectedVaultId(null);
    setSearchParams({});
  };

  const handleCreateVault = async (name: string, description: string) => {
    if (!profile?.organization_id) return;
    const { data, error } = await supabase.from("vaults").insert({
      name,
      description: description || null,
      organization_id: profile.organization_id,
      created_by: profile.id,
    }).select().single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setVaults((prev) => [...prev, data]);
      setFileCounts((prev) => ({ ...prev, [data.id]: 0 }));
      toast({ title: "Vault created", description: `${name} is ready.` });
    }
  };

  const handleUpload = async (fileList: File[]) => {
    if (!profile?.organization_id || !selectedVaultId) return;
    setUploading(true);
    for (const file of fileList) {
      const fileId = crypto.randomUUID();
      const r2Key = `${profile.organization_id}/${selectedVaultId}/${fileId}-${file.name}`;
      try {
        // Upload to R2 via edge function
        const formData = new FormData();
        formData.append("file", file);
        formData.append("orgId", profile.organization_id);
        formData.append("r2Key", r2Key);

        const { data: { session } } = await supabase.auth.getSession();
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/r2-upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Upload failed");
        }

        const result = await response.json();

        // Create file record in DB
        const { error: dbError } = await supabase.from("files").insert({
          id: fileId,
          name: file.name,
          original_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          storage_path: result.r2_key || r2Key,
          vault_id: selectedVaultId,
          organization_id: profile.organization_id!,
          uploaded_by: profile.id,
          status: "processing",
        });
        if (dbError) throw dbError;

        supabase.functions.invoke("document-processor", {
          body: { fileId },
        }).catch((err) => console.warn("Processing trigger failed:", err));

        toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      }
    }
    setUploading(false);
  };

  if (loading) {
    return <AppLayout><VaultSkeleton /></AppLayout>;
  }

  return (
    <AppLayout>
      <FileUploadZone onFilesSelected={handleUpload}>
        {selectedVault ? (
          <VaultDetail
            vault={selectedVault}
            files={files}
            onBack={handleBack}
            onUpload={handleUpload}
            uploading={uploading}
          />
        ) : (
          <VaultGrid
            vaults={vaults}
            fileCounts={fileCounts}
            onSelectVault={handleSelectVault}
            onCreateVault={handleCreateVault}
          />
        )}
      </FileUploadZone>
    </AppLayout>
  );
}
