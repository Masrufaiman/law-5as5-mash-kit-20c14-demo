import { useState } from "react";
import { Copy, Download, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ResponseActionsProps {
  content: string;
  messageId?: string;
  conversationId?: string;
  onRegenerate?: () => void;
}

export function ResponseActions({ content, messageId, conversationId, onRegenerate }: ResponseActionsProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [feedback, setFeedback] = useState<"up" | "down" | null>(() => {
    if (!messageId) return null;
    const stored = localStorage.getItem(`feedback-${messageId}`);
    return stored as "up" | "down" | null;
  });

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Response copied to clipboard" });
  };

  const exportAsText = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lawkit-response.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Downloaded as text file" });
  };

  const handleFeedback = async (type: "up" | "down") => {
    const newFeedback = feedback === type ? null : type;
    setFeedback(newFeedback);

    // Persist to localStorage
    if (messageId) {
      if (newFeedback) {
        localStorage.setItem(`feedback-${messageId}`, newFeedback);
      } else {
        localStorage.removeItem(`feedback-${messageId}`);
      }
    }

    // Persist to Supabase
    if (messageId && profile?.organization_id) {
      try {
        if (newFeedback) {
          await supabase.from("message_feedback").upsert(
            {
              message_id: messageId,
              conversation_id: conversationId || "",
              organization_id: profile.organization_id,
              user_id: profile.id,
              feedback: newFeedback,
            },
            { onConflict: "message_id,user_id" }
          );
        } else {
          await supabase
            .from("message_feedback")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", profile.id);
        }
      } catch {
        // Silently fail — localStorage is the fallback
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
    }
  };

  return (
    <div className="flex items-center justify-between mt-2 opacity-50 group-hover:opacity-100 transition-opacity">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={copyToClipboard}
          title="Copy"
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={exportAsMarkdown}
          title="Download"
        >
          <Download className="h-3 w-3" />
          Download
        </Button>
        {onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={handleRegenerate}
            title="Regenerate"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </Button>
        )}
      </div>
      <div className="flex items-center gap-0.5">
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
          <ThumbsUp className="h-3 w-3" fill={feedback === "up" ? "currentColor" : "none"} />
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
          <ThumbsDown className="h-3 w-3" fill={feedback === "down" ? "currentColor" : "none"} />
        </Button>
      </div>
    </div>
  );
}
