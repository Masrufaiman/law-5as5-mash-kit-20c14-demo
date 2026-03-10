import { useEffect, useState, useRef } from "react";
import { FileText, FolderOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  name: string;
  vault_name: string;
  status?: string;
}

interface MentionDropdownProps {
  query: string;
  visible: boolean;
  onSelect: (file: FileItem) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

export function MentionDropdown({ query, visible, onSelect, onClose, position }: MentionDropdownProps) {
  const { profile } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !profile?.organization_id) return;

    const load = async () => {
      setLoading(true);
      try {
        // Query files - use separate vault lookup to avoid join issues
        let q = supabase
          .from("files")
          .select("id, name, vault_id, status")
          .eq("organization_id", profile.organization_id!)
          .in("status", ["ready", "processing"])
          .order("created_at", { ascending: false })
          .limit(15);

        if (query) {
          q = q.ilike("name", `%${query}%`);
        }

        const { data: filesData } = await q;

        if (!filesData?.length) {
          // Also try searching vault names if no file matches
          if (query) {
            const { data: vaultData } = await supabase
              .from("vaults")
              .select("id, name")
              .eq("organization_id", profile.organization_id!)
              .ilike("name", `%${query}%`)
              .limit(5);

            if (vaultData?.length) {
              // Get files from matching vaults
              const vaultIds = vaultData.map(v => v.id);
              const { data: vaultFiles } = await supabase
                .from("files")
                .select("id, name, vault_id, status")
                .in("vault_id", vaultIds)
                .in("status", ["ready", "processing"])
                .order("created_at", { ascending: false })
                .limit(10);

              if (vaultFiles?.length) {
                const vaultMap = Object.fromEntries(vaultData.map(v => [v.id, v.name]));
                const mapped = vaultFiles.map(f => ({
                  id: f.id,
                  name: f.name,
                  vault_name: vaultMap[f.vault_id] || "Vault",
                  status: f.status,
                }));
                setFiles(mapped);
                setSelectedIndex(0);
                setLoading(false);
                return;
              }
            }
          }
          setFiles([]);
          setSelectedIndex(0);
          setLoading(false);
          return;
        }

        // Get vault names for the files
        const vaultIds = [...new Set(filesData.map(f => f.vault_id))];
        const { data: vaultsData } = await supabase
          .from("vaults")
          .select("id, name")
          .in("id", vaultIds);

        const vaultMap = Object.fromEntries((vaultsData || []).map(v => [v.id, v.name]));

        const mapped = filesData.map(f => ({
          id: f.id,
          name: f.name,
          vault_name: vaultMap[f.vault_id] || "Vault",
          status: f.status,
        }));
        setFiles(mapped);
        setSelectedIndex(0);
      } catch {
        setFiles([]);
      }
      setLoading(false);
    };

    load();
  }, [query, visible, profile?.organization_id]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, files.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && files[selectedIndex]) {
        e.preventDefault();
        onSelect(files[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, files, selectedIndex, onSelect, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-72 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
      style={position ? { bottom: position.top, left: position.left } : { bottom: "100%", left: 0 }}
    >
      <div className="p-1">
        <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">Files</p>
        {loading ? (
          <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching...
          </div>
        ) : files.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-muted-foreground text-center">
            {query ? `No files matching "${query}"` : "No files available"}
          </p>
        ) : (
          files.map((file, i) => (
            <button
              key={file.id}
              onClick={() => onSelect(file)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs text-foreground transition-colors",
                i === selectedIndex ? "bg-accent" : "hover:bg-muted"
              )}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <div className="text-left min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-2.5 w-2.5" />
                  {file.vault_name}
                  {file.status === "processing" && (
                    <span className="text-warning ml-1">· processing</span>
                  )}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
