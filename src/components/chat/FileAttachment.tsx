import { FileText, FileSpreadsheet, File as FileIcon, X } from "lucide-react";

interface FileAttachmentProps {
  name: string;
  size?: number;
  type?: string;
  onRemove?: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileText className="h-4 w-4 text-destructive" />;
  if (ext === "xlsx" || ext === "xls") return <FileSpreadsheet className="h-4 w-4 text-accent-foreground" />;
  if (ext === "docx" || ext === "doc") return <FileText className="h-4 w-4 text-primary" />;
  return <FileIcon className="h-4 w-4 text-muted-foreground" />;
}

function getTypeLabel(name: string) {
  const ext = name.split(".").pop()?.toUpperCase();
  return `${ext} document`;
}

export function FileAttachment({ name, size, type, onRemove }: FileAttachmentProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      {getIcon(name)}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground">
          {getTypeLabel(name)}
          {size ? ` · ${formatSize(size)}` : ""}
        </p>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
