import { FileText, Copy, Download, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface DraftBlockProps {
  title: string;
  content: string;
}

export function DraftBlock({ title, content }: DraftBlockProps) {
  const { toast } = useToast();

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden my-3">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">{title}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={async () => {
              await navigator.clipboard.writeText(content);
              toast({ title: "Copied" });
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Download className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="px-4 py-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
        {content}
      </div>
    </div>
  );
}
