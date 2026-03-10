import { useState, useRef } from "react";
import { ArrowLeft, Search, Upload, Filter, FileText, MoreHorizontal, Pencil, Trash2, Eye, X, Download, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileTable } from "./FileTable";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type FileRow = Tables<"files">;
type VaultRow = Tables<"vaults">;

function formatTotalSize(files: FileRow[]) {
  const total = files.reduce((sum, f) => sum + f.size_bytes, 0);
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(0)} KB`;
  if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(1)} MB`;
  return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface VaultDetailProps {
  vault: VaultRow;
  files: FileRow[];
  onBack: () => void;
  onUpload: (files: File[]) => void;
  uploading: boolean;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
}

export function VaultDetail({ vault, files, onBack, onUpload, uploading, onRename, onDelete }: VaultDetailProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(vault.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);

  const filtered = files.filter((f) => {
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || f.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== vault.name && onRename) {
      onRename(vault.id, editName.trim());
    }
    setIsEditingName(false);
  };

  const handleShare = async () => {
    if (!shareEmail.trim() || !profile?.id) return;
    setSharing(true);
    try {
      // Split by comma, newline, or semicolon to support multiple emails
      const emails = shareEmail
        .split(/[,;\n]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e && e.includes("@"));

      if (emails.length === 0) {
        toast({ title: "Invalid email", description: "Please enter valid email addresses.", variant: "destructive" });
        setSharing(false);
        return;
      }

      let successCount = 0;
      let duplicateCount = 0;
      for (const email of emails) {
        const { error } = await supabase.from("vault_shares" as any).insert({
          vault_id: vault.id,
          shared_with_email: email,
          shared_by: profile.id,
          permission: "view",
        });
        if (error) {
          if (error.code === "23505") {
            duplicateCount++;
          } else {
            throw error;
          }
        } else {
          successCount++;
        }
      }

      const parts: string[] = [];
      if (successCount > 0) parts.push(`Shared with ${successCount} user${successCount > 1 ? "s" : ""}`);
      if (duplicateCount > 0) parts.push(`${duplicateCount} already shared`);
      toast({ title: "Done", description: parts.join(". ") });
      setShareEmail("");
      setShowShareDialog(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {isEditingName ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") { setIsEditingName(false); setEditName(vault.name); }
                }}
                onBlur={handleSaveName}
                className="h-7 text-xl font-semibold font-heading px-1.5 py-0 flex-1"
                autoFocus
                onFocus={(e) => e.target.select()}
              />
            </div>
          ) : (
            <button
              onClick={() => onRename && setIsEditingName(true)}
              className="flex items-center gap-1.5 group min-w-0"
              title="Click to rename"
            >
              <h1 className="font-heading text-xl font-semibold text-foreground">{vault.name}</h1>
              {onRename && (
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
          )}
          <Badge variant="outline" className="text-[10px] ml-1">Vault</Badge>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setShowShareDialog(true)}
            >
              <Share2 className="h-3 w-3" />
              Share
            </Button>

            {(onRename || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onRename && (
                    <DropdownMenuItem onClick={() => { setEditName(vault.name); setIsEditingName(true); }}>
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Rename vault
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem className="text-destructive" onClick={() => setShowDeleteConfirm(true)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete vault
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground ml-7">
          {files.length} files · {formatTotalSize(files)}
          {vault.description && ` · ${vault.description}`}
        </p>
      </div>

      {/* Share dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Share vault "{vault.name}"
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the email of the person you want to share this vault with.</p>
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleShare()}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleShare} disabled={!shareEmail.trim() || sharing}>
              <Share2 className="h-3 w-3 mr-1.5" />
              {sharing ? "Sharing..." : "Share"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete vault "{vault.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this vault, all its files, vector embeddings, and associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete?.(vault.id); setShowDeleteConfirm(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete vault
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Project files header */}
      <div className="px-6 pt-4 pb-1">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            <SelectItem value="ready" className="text-xs">Ready</SelectItem>
            <SelectItem value="processing" className="text-xs">Processing</SelectItem>
            <SelectItem value="error" className="text-xs">Error</SelectItem>
            <SelectItem value="uploading" className="text-xs">Uploading</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* File table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">
              {files.length === 0 ? "No files yet" : "No matching files"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {files.length === 0 ? "Drag & drop files or click Upload" : "Try adjusting your search or filter"}
            </p>
          </div>
        ) : (
          <FileTable files={filtered} onFileClick={setPreviewFile} />
        )}
      </div>

      {/* File preview dialog */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {previewFile?.name}
            </DialogTitle>
          </DialogHeader>
          {previewFile && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Type</p>
                  <p className="font-medium text-foreground">{previewFile.mime_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Size</p>
                  <p className="font-medium text-foreground">{formatSize(previewFile.size_bytes)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="secondary" className="text-[10px]">{previewFile.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Uploaded</p>
                  <p className="font-medium text-foreground">{format(new Date(previewFile.created_at), "MMM d, yyyy")}</p>
                </div>
                {previewFile.page_count && (
                  <div>
                    <p className="text-muted-foreground text-xs">Pages</p>
                    <p className="font-medium text-foreground">{previewFile.page_count}</p>
                  </div>
                )}
                {previewFile.chunk_count && (
                  <div>
                    <p className="text-muted-foreground text-xs">Chunks</p>
                    <p className="font-medium text-foreground">{previewFile.chunk_count}</p>
                  </div>
                )}
              </div>
              {previewFile.error_message && (
                <div className="rounded-md bg-destructive/10 p-3">
                  <p className="text-xs text-destructive">{previewFile.error_message}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
