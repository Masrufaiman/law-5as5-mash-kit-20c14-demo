import { useState } from "react";
import { FolderOpen, BookOpen, Search, Plus, Shield, FileText, MessageSquare, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type VaultRow = Tables<"vaults">;

const VAULT_GRADIENTS = [
  "from-primary/20 to-primary/5",
  "from-accent/30 to-accent/10",
  "from-secondary/40 to-secondary/10",
  "from-muted to-muted/50",
];

interface VaultGridProps {
  vaults: VaultRow[];
  fileCounts: Record<string, number>;
  onSelectVault: (id: string) => void;
  onCreateVault: (name: string, description: string) => void;
  onDeleteVault?: (id: string) => void;
  onRenameVault?: (id: string, name: string) => void;
  userId?: string;
}

export function VaultGrid({ vaults, fileCounts, onSelectVault, onCreateVault, onDeleteVault, onRenameVault, userId }: VaultGridProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "yours">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const filtered = vaults
    .filter((v) => {
      if (tab === "yours" && userId && v.created_by !== userId) return false;
      return v.name.toLowerCase().includes(search.toLowerCase());
    });

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateVault(newName.trim(), newDesc.trim());
    setNewName("");
    setNewDesc("");
    setShowCreate(false);
  };

  const handleRename = (id: string) => {
    if (!renameName.trim() || !onRenameVault) return;
    onRenameVault(id, renameName.trim());
    setRenameId(null);
    setRenameName("");
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-2">
        <h1 className="font-heading text-2xl font-bold text-foreground">Vault</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Organize your legal documents and knowledge bases
        </p>
      </div>

      {/* Action cards */}
      <div className="px-8 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Card className="border border-border hover:border-primary/40 cursor-pointer transition-colors group">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-foreground group-hover:text-primary transition-colors">Create vault</p>
                  <p className="text-xs text-muted-foreground">Upload and organize documents</p>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Vault</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Supply Agreements" />
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What's this vault for?" rows={3} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Card className="border border-border hover:border-primary/40 cursor-pointer transition-colors group opacity-60">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Create knowledge base</p>
              <p className="text-xs text-muted-foreground">Add firm-specific guidance</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search */}
      <div className="px-8 flex items-center gap-4 border-b border-border pb-0">
        <button
          onClick={() => setTab("all")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "all" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All vaults
        </button>
        <button
          onClick={() => setTab("yours")}
          className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "yours" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Your vaults
        </button>
        <div className="flex-1" />
        <div className="relative pb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search vaults..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 w-52 text-sm"
          />
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameId} onOpenChange={(open) => !open && setRenameId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Vault</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && renameId) handleRename(renameId); }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameId(null)}>Cancel</Button>
              <Button onClick={() => renameId && handleRename(renameId)} disabled={!renameName.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vault grid */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-foreground">
              {tab === "yours" ? "You haven't created any vaults" : "No vaults yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Create a vault to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((vault, i) => (
              <Card
                key={vault.id}
                className="border border-border hover:border-primary/30 cursor-pointer transition-all group overflow-hidden relative"
                onClick={() => onSelectVault(vault.id)}
              >
                {/* Gradient header area */}
                <div className={`h-20 bg-gradient-to-br ${VAULT_GRADIENTS[i % VAULT_GRADIENTS.length]} flex items-center justify-center relative`}>
                  <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
                  {(onDeleteVault || onRenameVault) && (
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 bg-background/80 hover:bg-background">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {onRenameVault && (
                            <DropdownMenuItem onClick={() => { setRenameId(vault.id); setRenameName(vault.name); }}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                          )}
                          {onDeleteVault && (
                            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteVault(vault.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
                <CardContent className="pt-3 pb-3 px-3">
                  <p className="font-medium text-foreground text-sm truncate">{vault.name}</p>
                  {vault.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{vault.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <FileText className="h-3 w-3" />
                      {fileCounts[vault.id] ?? 0} files
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <MessageSquare className="h-3 w-3" />
                      0 queries
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    <Shield className="h-2.5 w-2.5 text-primary" />
                    <span className="text-[9px] text-primary font-medium">Secured by LawKit Vault</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
