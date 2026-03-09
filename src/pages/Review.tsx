import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Table2, ArrowLeft, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ReviewTable = Tables<"review_tables">;
type ReviewColumn = Tables<"review_columns">;
type ReviewRow = Tables<"review_rows">;

export default function Review() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [tables, setTables] = useState<ReviewTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<ReviewTable | null>(null);
  const [columns, setColumns] = useState<ReviewColumn[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableDesc, setNewTableDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Load tables
  useEffect(() => {
    if (!profile?.organization_id) return;
    const load = async () => {
      const { data } = await supabase
        .from("review_tables")
        .select("*")
        .eq("organization_id", profile.organization_id!)
        .order("created_at", { ascending: false });
      setTables(data || []);
      setLoading(false);
    };
    load();
  }, [profile?.organization_id]);

  // Load columns & rows for selected table
  useEffect(() => {
    if (!selectedTable) return;
    const load = async () => {
      const [colRes, rowRes] = await Promise.all([
        supabase
          .from("review_columns")
          .select("*")
          .eq("review_table_id", selectedTable.id)
          .order("column_order"),
        supabase
          .from("review_rows")
          .select("*")
          .eq("review_table_id", selectedTable.id)
          .order("created_at"),
      ]);
      setColumns(colRes.data || []);
      setRows(rowRes.data || []);
    };
    load();
  }, [selectedTable]);

  const createTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.organization_id) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("review_tables")
      .insert({
        name: newTableName,
        description: newTableDesc || null,
        organization_id: profile.organization_id!,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTables((prev) => [data, ...prev]);
      setShowCreate(false);
      setNewTableName("");
      setNewTableDesc("");
      toast({ title: "Created", description: `Review table "${data.name}" created.` });
    }
    setCreating(false);
  };

  const deleteTable = async (id: string) => {
    const { error } = await supabase.from("review_tables").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setTables((prev) => prev.filter((t) => t.id !== id));
    if (selectedTable?.id === id) setSelectedTable(null);
  };

  // Table detail view
  if (selectedTable) {
    return (
      <AppLayout>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedTable(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-heading text-xl font-semibold text-foreground">{selectedTable.name}</h1>
              {selectedTable.description && (
                <p className="text-sm text-muted-foreground">{selectedTable.description}</p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {columns.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Table2 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-foreground font-medium">No columns defined yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Columns will be created when you configure extraction queries for this review table.
                </p>
              </div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-mono text-xs">File</TableHead>
                      {columns.map((col) => (
                        <TableHead key={col.id} className="font-mono text-xs">{col.name}</TableHead>
                      ))}
                      <TableHead className="font-mono text-xs w-24">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columns.length + 2} className="text-center text-sm text-muted-foreground py-8">
                          No rows yet. Add files to extract data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.file_id.slice(0, 8)}...</TableCell>
                          {columns.map((col) => (
                            <TableCell key={col.id} className="text-sm">
                              {(row.values as Record<string, string>)?.[col.id] || "—"}
                            </TableCell>
                          ))}
                          <TableCell>
                            <Badge variant={row.status === "completed" ? "default" : "secondary"}>
                              {row.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // Tables list view
  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h1 className="font-heading text-xl font-semibold text-foreground">Review Tables</h1>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Table
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Review Table</DialogTitle>
              </DialogHeader>
              <form onSubmit={createTable} className="space-y-4">
                <div className="space-y-2">
                  <Label>Table Name</Label>
                  <Input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="e.g. Lease Agreement Review"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={newTableDesc}
                    onChange={(e) => setNewTableDesc(e.target.value)}
                    placeholder="What are you reviewing?"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={creating}>{creating ? "Creating..." : "Create"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : tables.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Table2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-foreground">No review tables yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create a review table to extract structured data from your documents.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map((table) => (
                <Card
                  key={table.id}
                  className="border border-border shadow-none cursor-pointer hover:bg-accent/30 transition-colors group"
                  onClick={() => setSelectedTable(table)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-foreground">{table.name}</p>
                        {table.description && (
                          <p className="text-sm text-muted-foreground mt-1">{table.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 font-mono">
                          {new Date(table.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTable(table.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
