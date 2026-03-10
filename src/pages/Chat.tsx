import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { SheetEditor } from "@/components/editor/SheetEditor";
import type { SheetData } from "@/components/editor/SheetEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useStreamChat } from "@/hooks/useStreamChat";
import type { Citation } from "@/hooks/useStreamChat";
import { StepTracker } from "@/components/chat/StepTracker";
import {
  Plus,
  Share,
  Download,
  MessageSquare,
  PanelRightOpen,
  PanelRightClose,
  StopCircle,
  Bot,
  Check,
  X,
  Pencil,
  Reply,
} from "lucide-react";

export default function Chat() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const initialMessageSentRef = useRef(false);

  const {
    messages,
    steps,
    searchSources,
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
  const [vaultName, setVaultName] = useState<string | undefined>();
  const [deepResearch, setDeepResearch] = useState(false);
  const [activeSources, setActiveSources] = useState<string[]>([]);
  const [promptMode, setPromptMode] = useState<string | undefined>();
  const [editorDoc, setEditorDoc] = useState<{ title: string; content: string } | null>(null);
  const [sheetDoc, setSheetDoc] = useState<SheetData | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [selectionTooltip, setSelectionTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [selectedVault, setSelectedVault] = useState<{ id: string; name: string } | null>(null);
  const [chatVaults, setChatVaults] = useState<{ id: string; name: string }[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Load vaults for sources dropdown
  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("vaults")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("created_at")
      .then(({ data }) => setChatVaults(data || []));
  }, [profile?.organization_id]);

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
      if (conv.vault_id) {
        setVaultId(conv.vault_id);
        // Load vault name
        const { data: vaultData } = await supabase.from("vaults").select("name").eq("id", conv.vault_id).single();
        if (vaultData) setVaultName(vaultData.name);
      }

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

  // Handle initial message from Home page
  useEffect(() => {
    const state = location.state as any;
    if (state?.initialMessage && profile?.organization_id && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true;
      const msg = state.initialMessage;
      const vault = state.selectedVault?.id;
      const vName = state.selectedVault?.name;
      const deep = state.deepResearch || false;
      const srcs = state.activeSources || [];
      const pMode = state.promptMode;

      setVaultId(vault);
      setVaultName(vName);
      setDeepResearch(deep);
      setActiveSources(srcs);
      setPromptMode(pMode);

      navigate("/chat", { replace: true, state: {} });
      createConversationAndSend(msg, vault, deep, srcs, pMode, vName);
    }
  }, [location.state, profile?.organization_id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, steps]);

  // Text selection → Reply tooltip
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectionTooltip(null);
        return;
      }

      const selectedText = selection.toString().trim();
      if (selectedText.length < 3) {
        setSelectionTooltip(null);
        return;
      }

      // Check if selection is within an assistant message
      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      if (!anchorNode || !focusNode) return;

      const isInContainer = container.contains(anchorNode) && container.contains(focusNode);
      if (!isInContainer) {
        setSelectionTooltip(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectionTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: selectedText,
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Hide tooltip if clicking outside of it
      const target = e.target as HTMLElement;
      if (!target.closest("[data-reply-tooltip]")) {
        setSelectionTooltip(null);
      }
    };

    container.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, []);

  const handleReplyWithSelection = () => {
    if (!selectionTooltip) return;
    const quoted = `> ${selectionTooltip.text.replace(/\n/g, "\n> ")}\n\n`;
    setInput(quoted + input);
    setSelectionTooltip(null);
    window.getSelection()?.removeAllRanges();
  };

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
    pMode?: string,
    vName?: string
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
      vaultName: vName || vaultName,
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
        vaultName,
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

  // Preserve scroll when toggling editor
  const handleDocumentOpen = useCallback((title: string, content: string) => {
    const container = scrollContainerRef.current;
    const scrollTop = container?.scrollTop || 0;

    setEditorDoc(
      editorDoc?.title === title ? null : { title, content }
    );

    // Restore scroll after re-render
    requestAnimationFrame(() => {
      if (container) container.scrollTop = scrollTop;
    });
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
    setSheetDoc(null);
    initialMessageSentRef.current = false;
    clearMessages();
    navigate("/chat", { replace: true });
  };

  // Rename conversation
  const startEditTitle = () => {
    if (!conversationId) return;
    setEditTitleValue(conversationTitle);
    setIsEditingTitle(true);
  };

  const saveTitle = async () => {
    const newTitle = editTitleValue.trim();
    if (!newTitle || !conversationId) {
      setIsEditingTitle(false);
      return;
    }
    setConversationTitle(newTitle);
    setIsEditingTitle(false);
    await supabase
      .from("conversations")
      .update({ title: newTitle })
      .eq("id", conversationId);
  };

  // Export conversation as markdown
  const handleExport = () => {
    if (!messages.length) return;
    const md = messages
      .map((m) => `## ${m.role === "user" ? "You" : "LawKit AI"}\n\n${m.content}`)
      .join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conversationTitle.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Conversation downloaded as Markdown" });
  };

  // Share conversation
  const handleShare = async () => {
    if (!conversationId) return;

    const token = crypto.randomUUID();
    const { error: shareErr } = await supabase
      .from("conversations")
      .update({ share_token: token, is_public: true })
      .eq("id", conversationId);

    if (shareErr) {
      toast({ title: "Error", description: "Failed to share conversation", variant: "destructive" });
      return;
    }

    const shareUrl = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(shareUrl);
    toast({ title: "Link copied!", description: "Public share link copied to clipboard" });
  };

  // Collect all citations
  const allCitations: Citation[] = messages
    .filter((m) => m.role === "assistant" && m.citations)
    .flatMap((m) => m.citations || []);

  // Find last assistant message index
  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === "assistant" ? i : acc, -1);
  const lastUserIdx = messages.reduce((acc, m, i) => m.role === "user" ? i : acc, -1);

  // Show streaming indicator when waiting for assistant response
  const lastMsg = messages[messages.length - 1];
  const showStreamingIndicator = isStreaming && lastMsg?.role === "user";

  const rightPanel = editorDoc ? (
    <DocumentEditor
      title={editorDoc.title}
      content={editorDoc.content}
      onClose={() => {
        const container = scrollContainerRef.current;
        const scrollTop = container?.scrollTop || 0;
        setEditorDoc(null);
        requestAnimationFrame(() => {
          if (container) container.scrollTop = scrollTop;
        });
      }}
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
              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <Input
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle();
                      if (e.key === "Escape") setIsEditingTitle(false);
                    }}
                    onBlur={saveTitle}
                    className="h-6 text-sm font-semibold flex-1 px-1.5 py-0"
                    autoFocus
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              ) : (
                <button
                  onClick={startEditTitle}
                  className="flex items-center gap-1.5 group min-w-0"
                  title={conversationTitle}
                >
                  <h2 className="text-sm font-semibold text-foreground truncate max-w-[300px]">
                    {conversationTitle}
                  </h2>
                  {conversationId && (
                    <Pencil className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </button>
              )}
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
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleShare}
                disabled={!conversationId}
              >
                <Share className="h-3 w-3" />
                Share
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleExport}
                disabled={messages.length === 0}
              >
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
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <div className="pl-8 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
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
            <ScrollArea className="flex-1" ref={scrollContainerRef as any}>
              <div className="mx-auto max-w-3xl px-6 py-6 space-y-6 relative" ref={messagesContainerRef}>
                {/* Reply tooltip for text selection */}
                {selectionTooltip && (
                  <div
                    data-reply-tooltip
                    className="fixed z-50 animate-in fade-in-0 zoom-in-95"
                    style={{
                      left: selectionTooltip.x,
                      top: selectionTooltip.y,
                      transform: "translate(-50%, -100%)",
                    }}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs gap-1.5 shadow-md border border-border"
                      onClick={handleReplyWithSelection}
                    >
                      <Reply className="h-3 w-3" />
                      Reply
                    </Button>
                  </div>
                )}

                {messages.map((msg, i) => {
                  const isLastAssistant = msg.role === "assistant" && i === lastAssistantIdx;
                  const isLastUser = msg.role === "user" && i === lastUserIdx;
                  const nextMsg = messages[i + 1] || undefined;

                  // Only pass steps to the last assistant message
                    const showSteps = msg.role === "assistant" && i === messages.length - 1;
                    const showSearchSources = showSteps ? searchSources : undefined;

                  return (
                    <div key={msg.id}>
                    <MessageBubble
                        message={msg}
                        nextMessage={nextMsg}
                        isStreaming={
                          isStreaming &&
                          msg.role === "assistant" &&
                          i === messages.length - 1
                        }
                        onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
                        onChoiceSelect={handleChoiceSelect}
                        onDocumentOpen={handleDocumentOpen}
                        isLastAssistant={isLastAssistant}
                        steps={showSteps ? steps : undefined}
                        isStreamingSteps={isStreaming}
                        searchSources={showSearchSources}
                        onFollowUp={handleChoiceSelect}
                      />

                      {/* Streaming indicator: skeleton or steps, always shows LawKit AI branding */}
                      {isLastUser && showStreamingIndicator && (
                        <div className="mt-6">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <span className="text-xs font-semibold text-foreground">LawKit AI</span>
                          </div>
                          <div className="pl-8">
                            {steps.length > 0 ? (
                              <StepTracker steps={steps} isStreaming={true} searchSources={searchSources} />
                            ) : (
                              <div className="space-y-3">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-2/3" />
                              </div>
                            )}
                          </div>
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
                promptMode={promptMode}
                onPromptModeChange={setPromptMode}
                vaults={chatVaults}
                selectedVault={selectedVault}
                onVaultSelect={(v) => {
                  setSelectedVault(v);
                  if (v) { setVaultId(v.id); setVaultName(v.name); }
                  else { setVaultId(undefined); setVaultName(undefined); }
                }}
                activeSources={activeSources}
                onSourceToggle={(s) => setActiveSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
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
