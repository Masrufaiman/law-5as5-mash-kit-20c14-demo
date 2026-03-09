import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { StepTracker } from "@/components/chat/StepTracker";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
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
  const initialMessageSentRef = useRef(false);

  const {
    messages,
    steps,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
    loadHistory,
    regenerateLastMessage,
  } = useStreamChat();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New Conversation");
  const [input, setInput] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [vaultId, setVaultId] = useState<string | undefined>();
  const [deepResearch, setDeepResearch] = useState(false);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [promptMode, setPromptMode] = useState<string | undefined>();
  const [editorDoc, setEditorDoc] = useState<{ title: string; content: string } | null>(null);

  // Load conversation from URL ?id=
  useEffect(() => {
    const convId = searchParams.get("id");
    if (convId && convId !== conversationId && profile?.organization_id) {
      loadConversation(convId);
    }
  }, [searchParams, profile?.organization_id]);

  const loadConversation = async (convId: string) => {
    setIsLoadingConversation(true);
    try {
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
    } finally {
      setIsLoadingConversation(false);
    }
  };

  // Handle initial message from Home page — with ref guard to prevent double-fire
  useEffect(() => {
    const state = location.state as any;
    if (state?.initialMessage && profile?.organization_id && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      const msg = state.initialMessage;
      const vault = state.selectedVault?.id;
      const deep = state.deepResearch || false;
      const srcs = state.activeSources || [];
      const pMode = state.promptMode;

      setVaultId(vault);
      setDeepResearch(deep);
      setActiveSources(srcs);
      setPromptMode(pMode);

      // Clear state AFTER capturing values
      navigate("/chat", { replace: true, state: {} });

      createConversationAndSend(msg, vault, deep, srcs, pMode);
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

  const lastStreamOptions = useRef<any>(null);

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

    const opts = {
      conversationId: data.id,
      organizationId: profile.organization_id!,
      vaultId: vault,
      deepResearch: deep,
      sources: srcs,
      useCase: pMode,
    };
    lastStreamOptions.current = opts;
    sendMessage(msg, opts);
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || isStreaming || !profile?.organization_id) return;
    if (!text) setInput("");

    if (!conversationId) {
      await createConversationAndSend(msg, vaultId, deepResearch, activeSources, promptMode);
    } else {
      const opts = {
        conversationId,
        organizationId: profile.organization_id!,
        vaultId,
        deepResearch,
        sources: activeSources,
        useCase: promptMode,
      };
      lastStreamOptions.current = opts;
      sendMessage(msg, opts);
    }
  };

  const handleChoiceSelect = useCallback((text: string) => {
    handleSend(text);
  }, [conversationId, profile?.organization_id, vaultId, deepResearch, activeSources, promptMode, isStreaming]);

  const handleDocumentOpen = useCallback((title: string, content: string) => {
    setEditorDoc(
      editorDoc?.title === title ? null : { title, content }
    );
  }, [editorDoc]);

  const handleRegenerate = () => {
    if (!lastStreamOptions.current || isStreaming) return;
    regenerateLastMessage(lastStreamOptions.current);
  };

  const handleNewThread = () => {
    setConversationId(null);
    setConversationTitle("New Conversation");
    setPromptMode(undefined);
    setEditorDoc(null);
    initialMessageSentRef.current = false;
    clearMessages();
    navigate("/chat", { replace: true });
  };

  // Collect all citations
  const allCitations: Citation[] = messages
    .filter((m) => m.role === "assistant" && m.citations)
    .flatMap((m) => m.citations || []);

  // Find last user/assistant message indices
  const lastUserIdx = messages.reduce((acc, m, i) => m.role === "user" ? i : acc, -1);
  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === "assistant" ? i : acc, -1);

  // Check if assistant has started content (for skeleton)
  const lastMsg = messages[messages.length - 1];
  const showSkeleton = isStreaming && lastMsg?.role === "user" && steps.length === 0;
  const showStepsBeforeResponse = steps.length > 0;

  const rightPanel = editorDoc ? (
    <DocumentEditor
      title={editorDoc.title}
      content={editorDoc.content}
      onClose={() => setEditorDoc(null)}
    />
  ) : undefined;

  return (
    <AppLayout rightPanel={rightPanel}>
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
          {isLoadingConversation ? (
            <div className="flex-1">
              <div className="mx-auto max-w-3xl px-6 py-6 space-y-8">
                {/* User message skeleton */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <div className="pl-8 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                {/* Assistant message skeleton */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="pl-8 space-y-2.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                {/* Another exchange skeleton */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <div className="pl-8 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="pl-8 space-y-2.5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          ) : messages.length === 0 && !isStreaming ? (
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
              <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
                {messages.map((msg, i) => {
                  const isLastUser = msg.role === "user" && i === lastUserIdx;
                  const isLastAssistant = msg.role === "assistant" && i === lastAssistantIdx;

                  return (
                    <div key={msg.id}>
                      <MessageBubble
                        message={msg}
                        isStreaming={
                          isStreaming &&
                          msg.role === "assistant" &&
                          i === messages.length - 1
                        }
                        onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
                        onChoiceSelect={handleChoiceSelect}
                        onDocumentOpen={handleDocumentOpen}
                        isLastAssistant={isLastAssistant}
                      />

                      {/* Steps AFTER last user message, BEFORE the assistant response */}
                      {isLastUser && showStepsBeforeResponse && (
                        <div className="pl-8 mt-4">
                          <StepTracker steps={steps} isStreaming={isStreaming} />
                        </div>
                      )}

                      {/* Skeleton loading when waiting for first token */}
                      {isLastUser && showSkeleton && (
                        <div className="pl-8 mt-4 space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                              <span className="text-[10px] font-bold text-muted-foreground">LK</span>
                            </div>
                            <span className="text-xs font-semibold text-foreground">LawKit AI</span>
                          </div>
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-2/3" />
                        </div>
                      )}
                    </div>
                  );
                })}

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
