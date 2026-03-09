import { FileText, FileSpreadsheet, File as FileIcon, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

type FileRow = Tables<"files">;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.includes("pdf")) return <FileText className="h-4 w-4 text-destructive" />;
  if (mime.includes("spreadsheet") || mime.includes("xlsx")) return <FileSpreadsheet className="h-4 w-4 text-accent-foreground" />;
  if (mime.includes("word") || mime.includes("doc")) return <FileText className="h-4 w-4 text-primary" />;
  return <FileIcon className="h-4 w-4 text-muted-foreground" />;
}

function getTypeLabel(mime: string) {
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("spreadsheet") || mime.includes("xlsx")) return "XLSX";
  if (mime.includes("word") || mime.includes("doc")) return "DOCX";
  if (mime.includes("text/plain")) return "TXT";
  if (mime.includes("markdown")) return "MD";
  return "File";
}

const statusColors: Record<string, string> = {
  ready: "bg-accent text-accent-foreground",
  processing: "bg-secondary text-secondary-foreground",
  error: "bg-destructive text-destructive-foreground",
  uploading: "bg-muted text-muted-foreground",
};

interface FileTableProps {
  files: FileRow[];
}

export function FileTable({ files }: FileTableProps) {
  if (files.length === 0) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[40%]">Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last modified</TableHead>
          <TableHead className="text-right">Size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {files.map((file) => (
          <TableRow key={file.id} className="cursor-pointer">
            <TableCell>
              <div className="flex items-center gap-2.5">
                {getFileIcon(file.mime_type)}
                <span className="text-sm font-medium text-foreground truncate max-w-[300px]">{file.name}</span>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground font-mono">{getTypeLabel(file.mime_type)}</span>
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className={`text-[10px] ${statusColors[file.status] || ""}`}>
                {file.status}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="text-xs text-muted-foreground">
                {format(new Date(file.updated_at), "MMM d, yyyy")}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <span className="text-xs text-muted-foreground">{formatSize(file.size_bytes)}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
