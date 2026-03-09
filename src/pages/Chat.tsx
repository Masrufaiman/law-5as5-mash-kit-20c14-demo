import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { StepTracker } from "@/components/chat/StepTracker";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStreamChat } from "@/hooks/useStreamChat";
import type { Citation } from "@/hooks/useStreamChat";
import {
  Plus,
  Share,
  Download,
  MessageSquare,
  PanelRightOpen,
  PanelRightClose,
  StopCircle,
} from "lucide-react";

export default function Chat() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    steps,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
    loadHistory,
  } = useStreamChat();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New Conversation");
  const [input, setInput] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [vaultId, setVaultId] = useState<string | undefined>();
  const [deepResearch, setDeepResearch] = useState(false);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [promptMode, setPromptMode] = useState<string | undefined>();

  // Load conversation from URL ?id=
  useEffect(() => {
    const convId = searchParams.get("id");
    if (convId && convId !== conversationId && profile?.organization_id) {
      loadConversation(convId);
    }
  }, [searchParams, profile?.organization_id]);

  const loadConversation = async (convId: string) => {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, title, vault_id")
      .eq("id", convId)
      .single();

    if (!conv) return;

    setConversationId(conv.id);
    setConversationTitle(conv.title);
    if (conv.vault_id) setVaultId(conv.vault_id);

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (msgs?.length) {
      loadHistory(
        msgs.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          citations: (m.citations as any) || undefined,
          model: m.model_used || undefined,
          createdAt: new Date(m.created_at),
        }))
      );
    }
  };

  // Handle initial message from Home page
  useEffect(() => {
    const state = location.state as any;
    if (state?.initialMessage && profile?.organization_id) {
      const msg = state.initialMessage;
      setVaultId(state.selectedVault?.id);
      setDeepResearch(state.deepResearch || false);
      setActiveSources(state.activeSources || []);
      setPromptMode(state.promptMode);
      navigate("/chat", { replace: true, state: {} });
      createConversationAndSend(msg, state.selectedVault?.id, state.deepResearch, state.activeSources, state.promptMode);
    }
  }, [location.state, profile?.organization_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, steps]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast({ title: "Error", description: error, variant: "destructive" });
    }
  }, [error]);

  const createConversationAndSend = async (
    msg: string,
    vault?: string,
    deep?: boolean,
    srcs?: string[],
    pMode?: string
  ) => {
    if (!profile?.organization_id) return;

    const { data, error: createError } = await supabase
      .from("conversations")
      .insert({
        organization_id: profile.organization_id!,
        created_by: profile.id,
        title: msg.slice(0, 60) + (msg.length > 60 ? "..." : ""),
        vault_id: vault || null,
      })
      .select()
      .single();

    if (createError || !data) {
      toast({ title: "Error", description: createError?.message || "Failed to create conversation", variant: "destructive" });
      return;
    }

    setConversationId(data.id);
    setConversationTitle(data.title);

    sendMessage(msg, {
      conversationId: data.id,
      organizationId: profile.organization_id!,
      vaultId: vault,
      deepResearch: deep,
      sources: srcs,
      useCase: pMode,
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !profile?.organization_id) return;
    const msg = input.trim();
    setInput("");

    if (!conversationId) {
      await createConversationAndSend(msg, vaultId, deepResearch, activeSources, promptMode);
    } else {
      sendMessage(msg, {
        conversationId,
        organizationId: profile.organization_id!,
        vaultId,
        deepResearch,
        sources: activeSources,
        useCase: promptMode,
      });
    }
  };

  const handleNewThread = () => {
    setConversationId(null);
    setConversationTitle("New Conversation");
    setPromptMode(undefined);
    clearMessages();
    navigate("/chat", { replace: true });
  };

  // Collect all citations
  const allCitations: Citation[] = messages
    .filter((m) => m.role === "assistant" && m.citations)
    .flatMap((m) => m.citations || []);

  // Find last assistant message index for step placement
  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === "assistant" ? i : acc, -1);

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground">Assistant /</span>
              <h2 className="text-sm font-semibold text-foreground truncate">
                {conversationTitle}
              </h2>
              {promptMode && (
                <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                  {promptMode === "red_flags" ? "Red Flag" : promptMode === "drafting" ? "Drafting" : "Chat"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleNewThread}
              >
                <Plus className="h-3 w-3" />
                New thread
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                <Share className="h-3 w-3" />
                Share
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                <Download className="h-3 w-3" />
                Export
              </Button>
              {allCitations.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowSources(!showSources)}
                >
                  {showSources ? (
                    <PanelRightClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelRightOpen className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                LawKit AI Assistant
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Ask questions about your documents, research legal topics, or draft content.
              </p>
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-3xl px-6 py-6 space-y-8">
                {messages.map((msg, i) => (
                  <div key={msg.id}>
                    <MessageBubble
                      message={msg}
                      isStreaming={
                        isStreaming &&
                        msg.role === "assistant" &&
                        i === messages.length - 1
                      }
                    />
                    {/* Show steps BELOW the last assistant message */}
                    {msg.role === "assistant" &&
                      i === lastAssistantIdx &&
                      steps.length > 0 && (
                        <div className="pl-8 mt-3">
                          <StepTracker steps={steps} isStreaming={isStreaming} />
                        </div>
                      )}
                  </div>
                ))}

                {/* Steps when streaming but no assistant message yet */}
                {steps.length > 0 &&
                  lastAssistantIdx === -1 &&
                  isStreaming && (
                    <div className="pl-8">
                      <StepTracker steps={steps} isStreaming={isStreaming} />
                    </div>
                  )}

                <div ref={scrollRef} />
              </div>
            </ScrollArea>
          )}

          {/* Cancel button */}
          {isStreaming && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={cancelStream}
              >
                <StopCircle className="h-3 w-3" />
                Stop generating
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="px-6 py-4">
            <div className="mx-auto max-w-3xl">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                disabled={isStreaming}
                deepResearch={deepResearch}
                onDeepResearchChange={setDeepResearch}
              />
            </div>
          </div>
        </div>

        {/* Sources panel */}
        {showSources && allCitations.length > 0 && (
          <SourcesPanel
            citations={allCitations}
            onClose={() => setShowSources(false)}
          />
        )}
      </div>
    </AppLayout>
  );
}
