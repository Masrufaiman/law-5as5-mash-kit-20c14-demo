import { useState } from "react";
import { Copy, Download, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ResponseActionsProps {
  content: string;
  messageId?: string;
  onRegenerate?: () => void;
}

export function ResponseActions({ content, messageId, onRegenerate }: ResponseActionsProps) {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(() => {
    if (!messageId) return null;
    const stored = localStorage.getItem(`feedback-${messageId}`);
    return stored as "up" | "down" | null;
  });

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Response copied to clipboard" });
  };

  const exportAsMarkdown = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lawkit-response.md";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Downloaded as Markdown file" });
  };

  const handleFeedback = (type: "up" | "down") => {
    const newFeedback = feedback === type ? null : type;
    setFeedback(newFeedback);
    if (messageId) {
      if (newFeedback) {
        localStorage.setItem(`feedback-${messageId}`, newFeedback);
      } else {
        localStorage.removeItem(`feedback-${messageId}`);
      }
    }
    if (newFeedback === "up") {
      toast({ title: "Thanks!", description: "Glad this was helpful" });
    } else if (newFeedback === "down") {
      toast({ title: "Noted", description: "We'll work on improving" });
    }
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate();
    } else {
      toast({ title: "Regenerate", description: "No regenerate handler available" });
    }
  };

  return (
    <div className="flex items-center gap-0.5 mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
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
        onClick={exportAsMarkdown}
        title="Export"
      >
        <Download className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={handleRegenerate}
        title="Regenerate"
      >
        <RefreshCw className="h-3 w-3" />
      </Button>
      <div className="mx-1 h-3 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0 hover:text-foreground",
          feedback === "up" ? "text-primary" : "text-muted-foreground"
        )}
        onClick={() => handleFeedback("up")}
        title="Helpful"
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-7 p-0 hover:text-foreground",
          feedback === "down" ? "text-destructive" : "text-muted-foreground"
        )}
        onClick={() => handleFeedback("down")}
        title="Not helpful"
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
