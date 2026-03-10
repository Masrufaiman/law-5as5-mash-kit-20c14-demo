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

interface UploadProgress {
  fileName: string;
  status: "uploading" | "processing" | "done" | "error";
}

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
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [sharedVaultIds, setSharedVaultIds] = useState<string[]>([]);

  const selectedVault = vaults.find((v) => v.id === selectedVaultId);

  // Load vaults + shared vaults
  useEffect(() => {
    if (!profile?.organization_id) return;
    const load = async () => {
      // Load org vaults
      const { data } = await supabase
        .from("vaults")
        .select("*")
        .eq("organization_id", profile.organization_id!)
        .order("created_at");
      
      // Load shared vault IDs for the current user
      const { data: shares } = await supabase
        .from("vault_shares" as any)
        .select("vault_id")
        .eq("shared_with_email", profile.email);
      
      const sharedIds = (shares || []).map((s: any) => s.vault_id);
      setSharedVaultIds(sharedIds);

      // If there are shared vaults from other orgs, load them too
      let allVaults = data || [];
      if (sharedIds.length > 0) {
        const orgVaultIds = new Set(allVaults.map(v => v.id));
        const missingIds = sharedIds.filter((id: string) => !orgVaultIds.has(id));
        if (missingIds.length > 0) {
          const { data: sharedVaults } = await supabase
            .from("vaults")
            .select("*")
            .in("id", missingIds);
          if (sharedVaults) allVaults = [...allVaults, ...sharedVaults];
        }
      }
      
      setVaults(allVaults);

      if (allVaults.length) {
        const counts: Record<string, number> = {};
        for (const v of allVaults) {
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
  }, [profile?.organization_id, profile?.email]);

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

  const handleRenameVault = async (id: string, name: string) => {
    const { error } = await supabase.from("vaults").update({ name }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setVaults((prev) => prev.map((v) => v.id === id ? { ...v, name } : v));
      toast({ title: "Renamed", description: `Vault renamed to "${name}".` });
    }
  };

  const handleDeleteVault = async (id: string) => {
    if (!profile?.organization_id) return;
    
    const { data: vaultFiles } = await supabase
      .from("files")
      .select("id")
      .eq("vault_id", id);

    if (vaultFiles?.length) {
      const fileIds = vaultFiles.map((f) => f.id);
      await supabase.from("file_chunks").delete().in("file_id", fileIds);
      await supabase.from("files").delete().eq("vault_id", id);
    }

    await supabase.from("conversations").delete().eq("vault_id", id);

    const { error } = await supabase.from("vaults").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setVaults((prev) => prev.filter((v) => v.id !== id));
      if (selectedVaultId === id) {
        setSelectedVaultId(null);
        setSearchParams({});
      }
      toast({ title: "Deleted", description: "Vault and all its data removed." });
    }
  };

  const uploadSingleFile = async (file: File): Promise<void> => {
    if (!profile?.organization_id || !selectedVaultId) return;
    
    const fileId = crypto.randomUUID();
    const sanitizedName = file.name.replace(/\s+/g, "_").replace(/[()]/g, "");
    const r2Key = `${profile.organization_id}/${selectedVaultId}/${fileId}-${sanitizedName}`;

    setUploadProgress(prev => [...prev, { fileName: file.name, status: "uploading" }]);

    try {
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
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Upload failed");
      }

      const result = await response.json();

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

      setUploadProgress(prev => prev.map(p => p.fileName === file.name ? { ...p, status: "processing" } : p));

      supabase.functions.invoke("document-processor", {
        body: { fileId },
      }).catch((err) => console.warn("Processing trigger failed:", err));

      setUploadProgress(prev => prev.map(p => p.fileName === file.name ? { ...p, status: "done" } : p));
    } catch (err: any) {
      setUploadProgress(prev => prev.map(p => p.fileName === file.name ? { ...p, status: "error" } : p));
      toast({ title: "Upload failed", description: `${file.name}: ${err.message}`, variant: "destructive" });
    }
  };

  const handleUpload = async (fileList: File[]) => {
    if (!profile?.organization_id || !selectedVaultId) return;
    setUploading(true);
    // Immediately show skeleton for ALL files before uploading
    setUploadProgress(fileList.map(f => ({ fileName: f.name, status: "uploading" as const })));

    const batchSize = 3;
    for (let i = 0; i < fileList.length; i += batchSize) {
      const batch = fileList.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(f => uploadSingleFile(f)));
    }

    toast({ title: "Upload complete", description: `${fileList.length} file(s) uploaded` });
    
    setTimeout(() => setUploadProgress([]), 3000);
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
            onRename={handleRenameVault}
            onDelete={handleDeleteVault}
          />
        ) : (
          <VaultGrid
            vaults={vaults}
            fileCounts={fileCounts}
            onSelectVault={handleSelectVault}
            onCreateVault={handleCreateVault}
            onDeleteVault={handleDeleteVault}
            onRenameVault={handleRenameVault}
            userId={profile?.id}
            userEmail={profile?.email}
            sharedVaultIds={sharedVaultIds}
          />
        )}
      </FileUploadZone>
    </AppLayout>
  );
}
