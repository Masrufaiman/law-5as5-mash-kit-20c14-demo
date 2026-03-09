import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, BookOpen, Edit, Upload, FileText, X, GraduationCap, Brain } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type KnowledgeEntry = Tables<"knowledge_entries">;

const CATEGORIES = [
  "Instruction",
  "Example (Few-shot)",
  "Rule",
  "Persona",
  "Legal Precedents",
  "Firm Policies",
  "Jurisdiction Rules",
  "Case Law",
  "Templates",
  "API Config",
  "General",
];

const APPLIES_TO_OPTIONS = [
  { id: "chat", label: "Chat / Research" },
  { id: "red_flags", label: "Red Flag Detection" },
  { id: "tables", label: "Review Tables" },
  { id: "drafting", label: "Document Drafting" },
  { id: "extraction", label: "Data Extraction" },
];

interface KnowledgeTabProps {
  orgId: string;
}

export function KnowledgeTab({ orgId }: KnowledgeTabProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("General");
  const [appliesTo, setAppliesTo] = useState<string[]>(["chat"]);
  const [isGlobal, setIsGlobal] = useState(false);

  // Training documents state
  const [trainingDocs, setTrainingDocs] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState("Legal Precedents");
  const [docDescription, setDocDescription] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docAppliesTo, setDocAppliesTo] = useState<string[]>(["chat"]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setEntries(data || []);

    // Load training docs from api_integrations
    const { data: docs } = await supabase
      .from("api_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("provider", "knowledge_document")
      .order("created_at", { ascending: false });
    setTrainingDocs(docs || []);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      if (editId) {
        const { error } = await supabase.from("knowledge_entries").update({
          title, content, category, is_global: isGlobal,
        }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("knowledge_entries").insert({
          title, content, category,
          organization_id: orgId,
          created_by: profile?.id,
          is_global: isGlobal,
        });
        if (error) throw error;
      }
      toast({ title: editId ? "Updated" : "Created" });
      resetForm();
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setTitle(""); setContent(""); setCategory("General");
    setAppliesTo(["chat"]); setIsGlobal(false);
    setShowAdd(false); setEditId(null);
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category || "General");
    setIsGlobal(entry.is_global || false);
    setShowAdd(true);
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("knowledge_entries").delete().eq("id", id);
    load();
    toast({ title: "Deleted" });
  };

  const handleUploadDoc = async () => {
    if (!docTitle.trim() || !docFile) {
      toast({ title: "Error", description: "Title and file are required", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      // Upload via R2 edge function
      const formData = new FormData();
      formData.append("file", docFile);
      formData.append("orgId", orgId);
      formData.append("type", "knowledge");

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

      // Save reference in api_integrations
      const { error } = await supabase.from("api_integrations").insert({
        name: docTitle,
        provider: "knowledge_document",
        organization_id: orgId,
        is_active: true,
        config: {
          category: docCategory,
          description: docDescription,
          applies_to: docAppliesTo,
          file_name: docFile.name,
          file_size: docFile.size,
          mime_type: docFile.type,
          r2_key: result.r2_key,
          status: "uploaded",
        },
      });
      if (error) throw error;

      toast({ title: "Uploaded", description: `${docTitle} uploaded successfully.` });
      setShowUpload(false);
      setDocTitle(""); setDocDescription(""); setDocFile(null);
      setDocCategory("Legal Precedents"); setDocAppliesTo(["chat"]);
      load();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteTrainingDoc = async (id: string) => {
    await supabase.from("api_integrations").delete().eq("id", id);
    load();
    toast({ title: "Deleted" });
  };

  const toggleAppliesTo = (id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-base font-semibold">Knowledge Base</h3>
        <p className="text-xs text-muted-foreground">Train your AI with firm-specific instructions, rules, and documents.</p>
      </div>

      <Tabs defaultValue="instructions" className="space-y-4">
        <TabsList className="bg-muted/50 border border-border h-auto p-1">
          <TabsTrigger value="instructions" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <Brain className="h-3.5 w-3.5" /> Instructions
          </TabsTrigger>
          <TabsTrigger value="training" className="text-xs gap-1.5 data-[state=active]:bg-background">
            <GraduationCap className="h-3.5 w-3.5" /> Training Documents
          </TabsTrigger>
        </TabsList>

        {/* Instructions Tab */}
        <TabsContent value="instructions" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Text-based AI instructions and guidance for your organization.</p>
            <Button size="sm" onClick={() => { setShowAdd(true); setEditId(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Entry
            </Button>
          </div>

          {entries.length === 0 && !showAdd ? (
            <Card className="border border-border">
              <CardContent className="py-8 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No knowledge entries yet.</p>
                <p className="text-muted-foreground text-xs mt-1">Add instructions to customize AI behavior.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <Card key={entry.id} className="border border-border">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium text-sm text-foreground">{entry.title}</p>
                          {entry.category && <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>}
                          {entry.is_global && <Badge variant="secondary" className="text-[10px]">Global</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(entry)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEntry(entry.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {showAdd && (
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">{editId ? "Edit Entry" : "Add Knowledge Entry"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Title</Label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Entry title" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Content</Label>
                  <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Instructions for the AI..." rows={4} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Applies to</Label>
                  <div className="flex flex-wrap gap-3">
                    {APPLIES_TO_OPTIONS.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`applies-${opt.id}`}
                          checked={appliesTo.includes(opt.id)}
                          onCheckedChange={() => toggleAppliesTo(opt.id, setAppliesTo)}
                        />
                        <label htmlFor={`applies-${opt.id}`} className="text-xs cursor-pointer">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-medium">Global entry</p>
                    <p className="text-[10px] text-muted-foreground">Available across all organizations</p>
                  </div>
                  <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
                  <Button size="sm" onClick={handleSave}>{editId ? "Update" : "Save"}</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Training Documents Tab */}
        <TabsContent value="training" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Upload legal documents, case law, and policies to train your AI.</p>
            <Button size="sm" onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-1" /> Upload Document
            </Button>
          </div>

          {trainingDocs.length === 0 && !showUpload ? (
            <Card className="border border-border">
              <CardContent className="py-8 text-center">
                <GraduationCap className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No training documents yet.</p>
                <p className="text-muted-foreground text-xs mt-1">Upload PDFs, case law, and firm policies to enhance AI knowledge.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {trainingDocs.map((doc) => {
                const config = (doc.config as any) || {};
                return (
                  <Card key={doc.id} className="border border-border">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-primary shrink-0 mt-0.5">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <p className="font-medium text-sm text-foreground">{doc.name}</p>
                              <Badge variant="outline" className="text-[10px]">{config.category}</Badge>
                              <Badge variant={doc.is_active ? "default" : "secondary"} className="text-[10px]">
                                {doc.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            {config.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{config.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-muted-foreground">{config.file_name}</span>
                              {config.file_size && (
                                <span className="text-[10px] text-muted-foreground">
                                  {(config.file_size / 1024 / 1024).toFixed(1)} MB
                                </span>
                              )}
                              {config.applies_to?.length > 0 && (
                                <div className="flex gap-1">
                                  {config.applies_to.map((a: string) => (
                                    <Badge key={a} variant="outline" className="text-[9px] py-0 px-1">{a}</Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                          onClick={() => deleteTrainingDoc(doc.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {showUpload && (
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Upload Training Document</CardTitle>
                <CardDescription className="text-xs">Upload legal documents to train the AI with firm-specific knowledge.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Document Title</Label>
                    <Input value={docTitle} onChange={e => setDocTitle(e.target.value)} placeholder="e.g. Delaware Corp Law Guide" className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Category</Label>
                    <Select value={docCategory} onValueChange={setDocCategory}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={docDescription} onChange={e => setDocDescription(e.target.value)} placeholder="What does this document teach the AI?" rows={2} className="text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">File</Label>
                  {docFile ? (
                    <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/30">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs text-foreground truncate flex-1">{docFile.name}</span>
                      <span className="text-[10px] text-muted-foreground">{(docFile.size / 1024 / 1024).toFixed(1)} MB</span>
                      <button onClick={() => setDocFile(null)}>
                        <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = ".pdf,.doc,.docx,.txt,.md";
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) setDocFile(file);
                        };
                        input.click();
                      }}
                      className="flex items-center gap-2 w-full p-3 rounded-md border border-dashed border-border hover:bg-muted/30 transition-colors"
                    >
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Click to select a file (PDF, DOC, DOCX, TXT, MD)</span>
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Applies to</Label>
                  <div className="flex flex-wrap gap-3">
                    {APPLIES_TO_OPTIONS.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`doc-applies-${opt.id}`}
                          checked={docAppliesTo.includes(opt.id)}
                          onCheckedChange={() => toggleAppliesTo(opt.id, setDocAppliesTo)}
                        />
                        <label htmlFor={`doc-applies-${opt.id}`} className="text-xs cursor-pointer">{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowUpload(false); setDocFile(null); }}>Cancel</Button>
                  <Button size="sm" onClick={handleUploadDoc} disabled={uploading}>
                    {uploading ? "Uploading..." : "Upload & Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
