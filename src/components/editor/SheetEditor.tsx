import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Eye, EyeOff, Save, Clock, Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SheetColumn {
  name: string;
  type: "free_response" | "date" | "classification" | "verbatim" | "number";
  query?: string;
}

export interface SheetRow {
  fileName: string;
  fileId?: string;
  status: "pending" | "completed" | "error";
  values: Record<string, string>;
}

export interface SheetData {
  title: string;
  columns: SheetColumn[];
  rows: SheetRow[];
}

interface SheetEditorProps {
  data: SheetData;
  onClose: () => void;
  onUpdate?: (data: SheetData) => void;
}

const COLUMN_TYPE_LABELS: Record<SheetColumn["type"], string> = {
  free_response: "Free response",
  date: "Date",
  classification: "Classification",
  verbatim: "Verbatim",
  number: "Number",
};

const COLUMN_TYPE_COLORS: Record<SheetColumn["type"], string> = {
  free_response: "bg-primary/10 text-primary",
  date: "bg-chart-2/20 text-chart-2",
  classification: "bg-chart-3/20 text-chart-3",
  verbatim: "bg-chart-4/20 text-chart-4",
  number: "bg-chart-5/20 text-chart-5",
};

function cellDiff(oldVal: string, newVal: string): string | null {
  if (oldVal === newVal) return null;
  if (!oldVal && newVal) return newVal;
  return newVal;
}

export function SheetEditor({ data, onClose, onUpdate }: SheetEditorProps) {
  const [sheetData, setSheetData] = useState<SheetData>(data);
  const [versions, setVersions] = useState<SheetData[]>([data]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [showEdits, setShowEdits] = useState(false);
  const [showColumnBuilder, setShowColumnBuilder] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    setSheetData(data);
    setVersions([data]);
    setCurrentVersion(0);
  }, [data]);

  const handleCellClick = (rowIdx: number, colName: string, currentValue: string) => {
    setEditingCell({ row: rowIdx, col: colName });
    setEditValue(currentValue || "");
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const updated = { ...sheetData };
    const newRows = [...updated.rows];
    newRows[editingCell.row] = {
      ...newRows[editingCell.row],
      values: { ...newRows[editingCell.row].values, [editingCell.col]: editValue },
    };
    updated.rows = newRows;
    setSheetData(updated);
    setEditingCell(null);
    onUpdate?.(updated);
  };

  const handleSaveVersion = () => {
    const last = versions[versions.length - 1];
    if (JSON.stringify(last) !== JSON.stringify(sheetData)) {
      const newVersions = [...versions, sheetData];
      setVersions(newVersions);
      setCurrentVersion(newVersions.length - 1);
    }
  };

  const handleAddColumn = (col: SheetColumn) => {
    const updated = {
      ...sheetData,
      columns: [...sheetData.columns, col],
      rows: sheetData.rows.map((r) => ({
        ...r,
        values: { ...r.values, [col.name]: "" },
      })),
    };
    setSheetData(updated);
    onUpdate?.(updated);
  };

  const handleDeleteColumn = (colName: string) => {
    const updated = {
      ...sheetData,
      columns: sheetData.columns.filter((c) => c.name !== colName),
      rows: sheetData.rows.map((r) => {
        const vals = { ...r.values };
        delete vals[colName];
        return { ...r, values: vals };
      }),
    };
    setSheetData(updated);
    onUpdate?.(updated);
  };

  // Diff for show edits
  const prevVersion = versions.length >= 2 ? versions[currentVersion > 0 ? currentVersion - 1 : 0] : null;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground truncate">{sheetData.title}</h3>
          <Badge variant="outline" className="text-[9px] py-0 px-1.5 shrink-0">
            <Clock className="h-2.5 w-2.5 mr-0.5" />
            v{currentVersion + 1}
          </Badge>
          <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
            {sheetData.rows.length} rows · {sheetData.columns.length} cols
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] gap-1 px-2"
            onClick={() => setShowColumnBuilder(true)}
          >
            <Plus className="h-3 w-3" />
            Add columns
          </Button>
          {versions.length >= 2 && (
            <Button
              variant={showEdits ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-[10px] gap-1 px-2"
              onClick={() => setShowEdits(!showEdits)}
            >
              {showEdits ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showEdits ? "Hide edits" : "Show edits"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] gap-1 px-2"
            onClick={handleSaveVersion}
          >
            <Save className="h-3 w-3" />
            Save
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      <ScrollArea className="flex-1">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-[180px] sticky left-0 bg-muted/50 z-10">
                  Document
                </th>
                {sheetData.columns.map((col) => (
                  <th key={col.name} className="px-3 py-2.5 text-left font-medium text-foreground min-w-[150px]">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{col.name}</span>
                      <Badge className={cn("text-[8px] py-0 px-1 font-normal", COLUMN_TYPE_COLORS[col.type])}>
                        {COLUMN_TYPE_LABELS[col.type]}
                      </Badge>
                      <button
                        onClick={() => handleDeleteColumn(col.name)}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive ml-auto"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    {col.query && (
                      <p className="text-[9px] text-muted-foreground font-normal mt-0.5 truncate max-w-[200px]">
                        {col.query}
                      </p>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-[80px]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sheetData.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="border-b border-border hover:bg-muted/30 transition-colors group">
                  <td className="px-3 py-2 font-medium text-foreground sticky left-0 bg-card group-hover:bg-muted/30 z-10">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[150px]">{row.fileName}</span>
                    </div>
                  </td>
                  {sheetData.columns.map((col) => {
                    const val = row.values[col.name] || "";
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === col.name;
                    const prevVal = showEdits && prevVersion
                      ? prevVersion.rows[rowIdx]?.values[col.name] || ""
                      : null;
                    const changed = showEdits && prevVal !== null && prevVal !== val;

                    return (
                      <td
                        key={col.name}
                        className={cn(
                          "px-3 py-2 text-foreground/90 cursor-pointer",
                          changed && "bg-chart-2/10"
                        )}
                        onClick={() => !isEditing && handleCellClick(rowIdx, col.name, val)}
                      >
                        {isEditing ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleCellSave();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                            className="h-6 text-xs px-1 py-0"
                            autoFocus
                          />
                        ) : (
                          <span className={cn("block truncate max-w-[200px]", !val && "text-muted-foreground italic")}>
                            {val || "—"}
                          </span>
                        )}
                        {changed && prevVal && (
                          <span className="text-[9px] text-destructive line-through block truncate">
                            {prevVal}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    <Badge
                      variant={row.status === "completed" ? "secondary" : row.status === "error" ? "destructive" : "outline"}
                      className="text-[8px] py-0 px-1.5"
                    >
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>

      {/* Column Builder Dialog */}
      <ColumnBuilderDialog
        open={showColumnBuilder}
        onClose={() => setShowColumnBuilder(false)}
        onAdd={handleAddColumn}
        existingColumns={sheetData.columns.map((c) => c.name)}
      />
    </div>
  );
}

function ColumnBuilderDialog({
  open,
  onClose,
  onAdd,
  existingColumns,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (col: SheetColumn) => void;
  existingColumns: string[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SheetColumn["type"]>("free_response");
  const [query, setQuery] = useState("");

  const handleAdd = () => {
    if (!name.trim() || existingColumns.includes(name.trim())) return;
    onAdd({ name: name.trim(), type, query: query.trim() || undefined });
    setName("");
    setQuery("");
    setType("free_response");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Column</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Column Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Effective Date"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <Select value={type} onValueChange={(v) => setType(v as SheetColumn["type"])}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free_response">Free response</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="classification">Classification</SelectItem>
                <SelectItem value="verbatim">Verbatim</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Extraction Query</label>
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What should the AI extract for this column?"
              className="text-sm min-h-[60px]"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleAdd} disabled={!name.trim()}>Add Column</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
