import { Copy, Download, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ResponseActionsProps {
  content: string;
}

export function ResponseActions({ content }: ResponseActionsProps) {
  const { toast } = useToast();

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Response copied to clipboard" });
  };

  return (
    <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={copyToClipboard}
        title="Copy"
      >
        <Copy className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        title="Export"
      >
        <Download className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        title="Rewrite"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
      <div className="mx-1 h-3 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        title="Helpful"
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        title="Not helpful"
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
