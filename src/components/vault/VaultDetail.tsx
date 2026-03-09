import { useState, useRef } from "react";
import { ArrowLeft, Search, Upload, FolderPlus, Filter, Sparkles, FileText, Table2, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

const QUERY_WORKFLOWS = [
  {
    title: "Start a query from scratch",
    description: "Ask any question about the documents in this vault",
    category: "General",
    color: "bg-primary",
  },
  {
    title: "Extract Terms from Agreements",
    description: "Identify and compare key terms across contracts",
    category: "Extraction",
    color: "bg-accent",
  },
  {
    title: "Analyze Change of Control",
    description: "Review change of control provisions across documents",
    category: "Analysis",
    color: "bg-secondary",
  },
];

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
          <Badge variant="outline" className="text-[10px] ml-1">Vault</Badge>
        </div>
        <p className="text-xs text-muted-foreground ml-7">
          {files.length} files · {formatTotalSize(files)}
          {vault.description && ` · ${vault.description}`}
        </p>
      </div>

      {/* Create new query section */}
      <div className="px-6 py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Create new query
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUERY_WORKFLOWS.map((wf) => (
            <Card
              key={wf.title}
              className="border border-border hover:border-primary/30 cursor-pointer transition-all group overflow-hidden"
            >
              <div className={`h-1 ${wf.color}`} />
              <CardContent className="pt-3 pb-3 px-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{wf.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {wf.description}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                </div>
                <Badge variant="outline" className="text-[9px] mt-2 py-0 px-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${wf.color} mr-1`} />
                  {wf.category}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
        <button className="text-xs text-primary hover:text-primary/80 mt-2 flex items-center gap-1 transition-colors">
          View all workflows
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* AI Prompt bar */}
      <div className="px-6 pb-3">
        <div className="relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Ask LawKit anything about this vault..."
            className="pl-10 bg-muted/50 border-border"
            readOnly
          />
        </div>
      </div>

      {/* Project files header */}
      <div className="px-6 pt-2 pb-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Project files
        </p>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-2 flex items-center gap-2">
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
          Create folder
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
