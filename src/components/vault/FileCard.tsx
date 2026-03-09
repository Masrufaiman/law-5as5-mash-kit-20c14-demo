import { FileText, FileSpreadsheet, File, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type FileRow = Tables<"files">;

function getFileIcon(mimeType: string) {
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("xlsx")) return FileSpreadsheet;
  return File;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusConfig = {
  uploading: { label: "Uploading", variant: "secondary" as const, icon: Loader2 },
  processing: { label: "Processing", variant: "secondary" as const, icon: Loader2 },
  ready: { label: "Ready", variant: "default" as const, icon: CheckCircle2 },
  error: { label: "Error", variant: "destructive" as const, icon: AlertCircle },
};

export function FileCard({ file, onClick }: { file: FileRow; onClick?: () => void }) {
  const Icon = getFileIcon(file.mime_type);
  const status = statusConfig[file.status];
  const StatusIcon = status.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent/50 w-full"
      )}
    >
      <Icon className="h-8 w-8 text-primary" />
      <div className="w-full min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size_bytes)}</p>
      </div>
      <Badge variant={status.variant} className="gap-1">
        <StatusIcon className={cn("h-3 w-3", (file.status === "uploading" || file.status === "processing") && "animate-spin")} />
        {status.label}
      </Badge>
    </button>
  );
}
