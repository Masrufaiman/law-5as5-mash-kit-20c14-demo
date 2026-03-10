import { useEffect, useState, useRef } from "react";
import { FileText, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface FileItem {
  id: string;
  name: string;
  vault_name: string;
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || !profile?.organization_id) return;

    const load = async () => {
      let q = supabase
        .from("files")
        .select("id, name, vaults!inner(name)")
        .eq("organization_id", profile.organization_id!)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(10);

      if (query) {
        q = q.ilike("name", `%${query}%`);
      }

      const { data } = await q;
      const mapped = (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        vault_name: f.vaults?.name || "Vault",
      }));
      setFiles(mapped);
      setSelectedIndex(0);
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

  if (!visible || files.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-72 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95"
      style={position ? { bottom: position.top, left: position.left } : { bottom: "100%", left: 0 }}
    >
      <div className="p-1">
        <p className="text-[10px] font-medium text-muted-foreground px-2.5 py-1 uppercase tracking-wider">Files</p>
        {files.map((file, i) => (
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
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
