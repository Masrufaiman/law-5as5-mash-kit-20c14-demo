import { useState, useRef } from "react";
import { ArrowLeft, Search, Upload, FolderPlus, Filter, Sparkles, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileTable } from "./FileTable";
import type { Tables } from "@/integrations/supabase/types";

type FileRow = Tables<"files">;
type VaultRow = Tables<"vaults">;

function formatTotalSize(files: FileRow[]) {
  const total = files.reduce((sum, f) => sum + f.size_bytes, 0);
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(0)} KB`;
  if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface VaultDetailProps {
  vault: VaultRow;
  files: FileRow[];
  onBack: () => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
}

export function VaultDetail({ vault, files, onBack, onUpload, uploading }: VaultDetailProps) {
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-heading text-xl font-semibold text-foreground">{vault.name}</h1>
        </div>
        <p className="text-xs text-muted-foreground ml-7">
          {files.length} files · {formatTotalSize(files)}
        </p>
      </div>

      {/* AI Prompt bar */}
      <div className="px-6 py-4">
        <div className="relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ask LawKit anything about this vault..."
            className="pl-10 bg-muted/50 border-border"
            readOnly
          />
        </div>
      </div>

      {/* Quick actions */}
      <div className="px-6 flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Create a draft document
        </Button>
        <Button variant="outline" size="sm" className="text-xs gap-1.5">
          <Table2 className="h-3.5 w-3.5" />
          Create a review table
        </Button>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <FolderPlus className="h-3.5 w-3.5" />
          Folder
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.doc,.xlsx,.txt,.md"
          onChange={(e) => {
            if (e.target.files?.length) onUpload(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </Button>
      </div>

      {/* File table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">No files yet</p>
            <p className="text-sm text-muted-foreground mt-1">Drag & drop files or click Upload</p>
          </div>
        ) : (
          <FileTable files={filtered} />
        )}
      </div>
    </div>
  );
}
