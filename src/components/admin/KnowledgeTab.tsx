import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, BookOpen, Edit, ChevronDown, FileText, Upload, Loader2, X } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type KnowledgeEntry = Tables<"knowledge_entries">;

interface KnowledgeTabProps {
  orgId: string;
}

export function KnowledgeTab({ orgId }: KnowledgeTabProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [sources, setSources] = useState<KnowledgeEntry[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Instruction editing state per source
  const [addingInstructionFor, setAddingInstructionFor] = useState<string | null>(null);
  const [instructionText, setInstructionText] = useState("");

  // Track which sources are open
  const [openSources, setOpenSources] = useState<Set<string>>(new Set());

  // Training docs
  const [trainingDocs, setTrainingDocs] = useState<any[]>([]);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setSources(data || []);

    const { data: docs } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "knowledge_document")
      .order("created_at", { ascending: false });
    setTrainingDocs(docs || []);
  };

  const handleCreateSource = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("knowledge_entries").insert({
        title: name,
        content: description || " ",
        category: "Source",
        organization_id: orgId,
        created_by: profile?.id,
        is_global: isGlobal,
      });
      if (error) throw error;
      toast({ title: "Source created" });
      setName(""); setDescription(""); setIsGlobal(false); setShowCreate(false); setEditId(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSource = async () => {
    if (!editId || !name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("knowledge_entries").update({
        title: name,
        content: description || " ",
        is_global: isGlobal,
      }).eq("id", editId);
      if (error) throw error;
      toast({ title: "Updated" });
      setName(""); setDescription(""); setIsGlobal(false); setShowCreate(false); setEditId(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditId(entry.id);
    setName(entry.title);
    setDescription(entry.content);
    setIsGlobal(entry.is_global || false);
    setShowCreate(true);
  };

  const deleteSource = async (id: string) => {
    await supabase.from("knowledge_entries").delete().eq("id", id);
    // Also delete associated training docs
    const associatedDocs = trainingDocs.filter(d => (d.config as any)?.source_id === id);
    for (const doc of associatedDocs) {
      await supabase.from("api_integrations").delete().eq("id", doc.id);
    }
    load();
    toast({ title: "Source deleted" });
  };

  const toggleSourceOpen = (id: string) => {
    setOpenSources(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Add instruction (append to content)
  const handleAddInstruction = async (sourceId: string) => {
    if (!instructionText.trim()) return;
    const source = sources.find(s => s.id === sourceId);
    if (!source) return;

    const currentContent = source.content || "";
    const newContent = currentContent.trim() === "" || currentContent.trim() === " "
      ? instructionText
      : currentContent + "\n\n---\n\n" + instructionText;

    try {
      const { error } = await supabase.from("knowledge_entries")
        .update({ content: newContent })
        .eq("id", sourceId);
      if (error) throw error;
      toast({ title: "Instruction added" });
      setInstructionText("");
      setAddingInstructionFor(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Upload document for a source
  const handleUploadDoc = async (sourceId: string, file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgId", orgId);
      formData.append("type", "knowledge");

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

      const { error } = await supabase.from("api_integrations").insert({
        name: file.name,
        provider: "knowledge_document",
        organization_id: orgId,
        is_active: true,
        config: {
          source_id: sourceId,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          r2_key: result.r2_key,
          status: "uploaded",
        },
      });
      if (error) throw error;

      toast({ title: "Document uploaded" });
      setUploadingFor(null);
      load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (id: string) => {
    await supabase.from("api_integrations").delete().eq("id", id);
    load();
    toast({ title: "Document deleted" });
  };

  const getDocsForSource = (sourceId: string) =>
    trainingDocs.filter(d => (d.config as any)?.source_id === sourceId);

  const getInstructions = (content: string): string[] => {
    if (!content || content.trim() === "" || content.trim() === " ") return [];
    return content.split("\n\n---\n\n").filter(s => s.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">Knowledge Base</h3>
          <p className="text-xs text-muted-foreground">Create sources, add instructions, and upload documents to train your AI.</p>
        </div>
        <Button size="sm" onClick={() => { setShowCreate(true); setEditId(null); setName(""); setDescription(""); setIsGlobal(false); }}>
          <Plus className="h-4 w-4 mr-1" /> Create Source
        </Button>
      </div>

      {/* Create/Edit Source Form */}
      {showCreate && (
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editId ? "Edit Source" : "Create New Source"}</CardTitle>
            <CardDescription className="text-xs">Give your source a name and description. You can add instructions and documents after creating it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Contract Review Guidelines" className="h-8 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe this source..." rows={3} className="text-sm" />
            </div>
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-xs font-medium">Global source</p>
                <p className="text-[10px] text-muted-foreground">Available across all organizations</p>
              </div>
              <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</Button>
              <Button size="sm" onClick={editId ? handleUpdateSource : handleCreateSource} disabled={saving || !name.trim()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sources List */}
      {sources.length === 0 && !showCreate ? (
        <Card className="border border-border">
          <CardContent className="py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No sources yet.</p>
            <p className="text-muted-foreground text-xs mt-1">Create a source to start training your AI.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => {
            const isOpen = openSources.has(source.id);
            const docs = getDocsForSource(source.id);
            const instructions = getInstructions(source.content);

            return (
              <Collapsible key={source.id} open={isOpen} onOpenChange={() => toggleSourceOpen(source.id)}>
                <Card className="border border-border">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 text-left">
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <p className="font-medium text-sm text-foreground">{source.title}</p>
                          {source.is_global && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                          <Badge variant="outline" className="text-[10px]">
                            {instructions.length} instruction{instructions.length !== 1 ? "s" : ""} · {docs.length} doc{docs.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(source)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSource(source.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent className="mt-3 space-y-3">
                      {/* Description */}
                      {source.content && source.content.trim() !== "" && source.content.trim() !== " " && (
                        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">{source.content.split("\n\n---\n\n")[0]?.substring(0, 150)}{source.content.length > 150 ? "..." : ""}</p>
                      )}

                      {/* Instructions Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Instructions</p>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => { setAddingInstructionFor(source.id); setInstructionText(""); }}>
                            <Plus className="h-3 w-3" /> Add
                          </Button>
                        </div>

                        {instructions.length > 0 && (
                          <div className="space-y-1">
                            {instructions.map((inst, i) => (
                              <div key={i} className="bg-muted/50 rounded px-3 py-2 text-xs text-foreground">
                                {inst.substring(0, 200)}{inst.length > 200 ? "..." : ""}
                              </div>
                            ))}
                          </div>
                        )}

                        {addingInstructionFor === source.id && (
                          <div className="space-y-2">
                            <Textarea
                              value={instructionText}
                              onChange={e => setInstructionText(e.target.value)}
                              placeholder="Add an instruction for the AI..."
                              rows={3}
                              className="text-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAddingInstructionFor(null)}>Cancel</Button>
                              <Button size="sm" className="h-7 text-xs" onClick={() => handleAddInstruction(source.id)} disabled={!instructionText.trim()}>Add</Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Documents Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setUploadingFor(source.id)}>
                            <Upload className="h-3 w-3" /> Upload
                          </Button>
                        </div>

                        {docs.length > 0 && (
                          <div className="space-y-1">
                            {docs.map((doc) => {
                              const config = (doc.config as any) || {};
                              return (
                                <div key={doc.id} className="flex items-center justify-between bg-muted/50 rounded px-3 py-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-xs text-foreground truncate">{doc.name}</span>
                                    {config.file_size && (
                                      <span className="text-[10px] text-muted-foreground">{(config.file_size / 1024 / 1024).toFixed(1)} MB</span>
                                    )}
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" onClick={() => deleteDoc(doc.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {uploadingFor === source.id && (
                          <div className="border border-dashed border-border rounded-md p-4 text-center">
                            {uploading ? (
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-xs text-muted-foreground">Uploading...</span>
                              </div>
                            ) : (
                              <>
                                <p className="text-xs text-muted-foreground mb-2">Select a file to upload</p>
                                <div className="flex items-center justify-center gap-2">
                                  <Button size="sm" className="h-7 text-xs" onClick={() => {
                                    const input = document.createElement("input");
                                    input.type = "file";
                                    input.accept = ".pdf,.doc,.docx,.txt,.md";
                                    input.onchange = (e) => {
                                      const file = (e.target as HTMLInputElement).files?.[0];
                                      if (file) handleUploadDoc(source.id, file);
                                    };
                                    input.click();
                                  }}>
                                    Choose File
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUploadingFor(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}
