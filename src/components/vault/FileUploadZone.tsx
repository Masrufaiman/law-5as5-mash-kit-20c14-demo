import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
];

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  children: React.ReactNode;
}

export function FileUploadZone({ onFilesSelected, children }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ALLOWED_TYPES.includes(f.type) || f.name.endsWith(".md")
    );
    if (files.length) onFilesSelected(files);
  }, [onFilesSelected]);

  return (
    <div
      className="relative h-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 border-2 border-dashed border-primary rounded-lg">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-12 w-12" />
            <p className="text-lg font-medium">Drop files here</p>
            <p className="text-sm text-muted-foreground">PDF, DOCX, XLSX, TXT, MD</p>
          </div>
        </div>
      )}
    </div>
  );
}
