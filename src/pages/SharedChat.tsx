import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot } from "lucide-react";
import type { ChatMessage } from "@/hooks/useStreamChat";

export default function SharedChat() {
  const { token } = useParams<{ token: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    (async () => {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, title")
        .eq("share_token", token)
        .eq("is_public", true)
        .single();

      if (convErr || !conv) {
        setError("Conversation not found or no longer shared.");
        setLoading(false);
        return;
      }

      setTitle(conv.title);

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true });

      setMessages(
        (msgs || []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: (m.citations as any) || undefined,
          model: m.model_used || undefined,
          createdAt: new Date(m.created_at),
        }))
      );
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-3xl px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground">{error}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/50 px-6 py-3">
        <div className="mx-auto max-w-3xl flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
          <span className="text-xs text-muted-foreground ml-auto">Shared conversation</span>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            nextMessage={messages[i + 1]}
          />
        ))}
      </div>
    </div>
  );
}
