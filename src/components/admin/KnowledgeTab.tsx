import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, BookOpen, Edit } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type KnowledgeEntry = Tables<"knowledge_entries">;

const CATEGORIES = ["Legal Precedents", "Firm Policies", "Jurisdiction Rules", "Templates", "General"];

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

  useEffect(() => { load(); }, [orgId]);

  const load = async () => {
    const { data } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setEntries(data || []);
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      if (editId) {
        const { error } = await supabase.from("knowledge_entries").update({ title, content, category }).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("knowledge_entries").insert({
          title, content, category,
          organization_id: orgId,
          created_by: profile?.id,
        });
        if (error) throw error;
      }
      toast({ title: editId ? "Updated" : "Created" });
      setTitle(""); setContent(""); setCategory("General");
      setShowAdd(false); setEditId(null);
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const startEdit = (entry: KnowledgeEntry) => {
    setEditId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category || "General");
    setShowAdd(true);
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("knowledge_entries").delete().eq("id", id);
    load();
    toast({ title: "Deleted" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-base font-semibold">Knowledge Base</h3>
          <p className="text-xs text-muted-foreground">Firm-specific AI instructions and guidance.</p>
        </div>
        <Button size="sm" onClick={() => { setShowAdd(true); setEditId(null); setTitle(""); setContent(""); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Entry
        </Button>
      </div>

      {entries.length === 0 && !showAdd ? (
        <Card className="border border-border">
          <CardContent className="py-8 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No knowledge entries yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card key={entry.id} className="border border-border">
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm text-foreground">{entry.title}</p>
                      {entry.category && <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>}
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
              <Button size="sm" onClick={handleSave}>{editId ? "Update" : "Save"}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
