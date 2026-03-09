import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatInput } from "@/components/chat/ChatInput";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Conversation = Tables<"conversations">;
type Message = Tables<"messages">;

export default function Chat() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [integrations, setIntegrations] = useState<{ name: string; provider: string }[]>([]);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("conversations")
      .select("*")
      .eq("organization_id", profile.organization_id!)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setConversations(data || []);
        setLoading(false);
      });

    // Load active integrations for chips
    supabase
      .from("api_integrations")
      .select("name, provider")
      .eq("organization_id", profile.organization_id!)
      .eq("is_active", true)
      .then(({ data }) => setIntegrations(data || []));
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!selectedConvoId) { setMessages([]); return; }
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selectedConvoId)
      .order("created_at")
      .then(({ data }) => setMessages(data || []));

    const channel = supabase
      .channel(`messages-${selectedConvoId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selectedConvoId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvoId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createConversation = async () => {
    if (!profile?.organization_id) return;
    const { data, error } = await supabase
      .from("conversations")
      .insert({ organization_id: profile.organization_id!, created_by: profile.id, title: "New Conversation" })
      .select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setConversations((prev) => [data, ...prev]);
    setSelectedConvoId(data.id);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedConvoId === id) { setSelectedConvoId(null); setMessages([]); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConvoId || !profile?.organization_id) return;
    setSending(true);
    const userMessage = input.trim();
    setInput("");

    await supabase.from("messages").insert({
      conversation_id: selectedConvoId,
      organization_id: profile.organization_id!,
      role: "user",
      content: userMessage,
    });

    if (messages.length === 0) {
      const title = userMessage.slice(0, 60) + (userMessage.length > 60 ? "..." : "");
      await supabase.from("conversations").update({ title }).eq("id", selectedConvoId);
      setConversations((prev) => prev.map((c) => (c.id === selectedConvoId ? { ...c, title } : c)));
    }

    // Placeholder AI response
    await supabase.from("messages").insert({
      conversation_id: selectedConvoId,
      organization_id: profile.organization_id!,
      role: "assistant",
      content: "AI responses will be available once an LLM provider is configured in the Admin panel.",
    });
    setSending(false);
  };

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Conversation sidebar */}
        <div className="w-64 flex-shrink-0 flex flex-col border-r border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-heading text-sm font-semibold">Conversations</h2>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={createConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)
              ) : conversations.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No conversations yet</p>
              ) : (
                conversations.map((convo) => (
                  <div
                    key={convo.id}
                    className={cn(
                      "group flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer transition-colors",
                      selectedConvoId === convo.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    onClick={() => setSelectedConvoId(convo.id)}
                  >
                    <span className="truncate">{convo.title}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); deleteConversation(convo.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div className="flex flex-1 flex-col">
          {selectedConvoId ? (
            <>
              <ScrollArea className="flex-1 p-6">
                <div className="mx-auto max-w-2xl space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "rounded-lg border border-border p-4",
                        msg.role === "user" ? "bg-card ml-8" : "bg-secondary/30 mr-8"
                      )}
                    >
                      <p className="mb-1 text-xs font-medium text-muted-foreground font-mono">
                        {msg.role === "user" ? "You" : "LawKit AI"}
                      </p>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                  <div ref={scrollRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-border px-6 py-4">
                <div className="mx-auto max-w-2xl">
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSend={sendMessage}
                    disabled={sending}
                    integrations={integrations}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h2 className="font-heading text-xl font-semibold text-foreground">LawKit AI Assistant</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Ask questions about your documents, research legal topics, or draft content.
              </p>
              <Button className="mt-4" onClick={createConversation}>
                <Plus className="h-4 w-4 mr-1" /> New Conversation
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
