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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Loader2,
  Mail,
  Trash2,
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
    plan,
    thinkingText,
    fileRefs,
    inlineData,
    contradictions,
    verifications,
    escalations,
    selfCheckStatus,
    intent,
    planUpdateReason,
    progress,
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
  const [workflowTag, setWorkflowTag] = useState<{ title: string; systemPrompt?: string } | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [replyContext, setReplyContext] = useState<string | null>(null);
  // Track attached file IDs for Uploads vault scoping across messages
  const [conversationAttachedFileIds, setConversationAttachedFileIds] = useState<string[]>([]);
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

  // Helper: process attached files through R2/OCR pipeline
  const processAttachedFiles = async (files: File[]): Promise<{ fileIds: string[]; fileNames: string[]; vaultId: string }> => {
    if (!profile?.organization_id) throw new Error("No org");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");

    // Find or create an "Uploads" vault
    let { data: pVault } = await supabase
      .from("vaults")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("name", "Uploads")
      .maybeSingle();

    if (!pVault) {
      // Also check for legacy name
      const { data: legacyVault } = await supabase
        .from("vaults")
        .select("id")
        .eq("organization_id", profile.organization_id)
        .eq("name", "Prompt Uploads")
        .maybeSingle();
      
      if (legacyVault) {
        pVault = legacyVault;
      } else {
        const { data: newVault, error: vErr } = await supabase
          .from("vaults")
          .insert({ name: "Uploads", organization_id: profile.organization_id, created_by: profile.id, description: "Default vault for uploaded documents" })
          .select()
          .single();
        if (vErr || !newVault) throw new Error("Failed to create upload vault");
        pVault = newVault;
      }
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const fileIds: string[] = [];
    const fileNames: string[] = [];

    for (const file of files) {
      const fileId = crypto.randomUUID();
      const sanitizedName = file.name.replace(/\s+/g, "_").replace(/[()]/g, "");
      const r2Key = `${profile.organization_id}/${pVault.id}/${fileId}-${sanitizedName}`;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgId", profile.organization_id);
      formData.append("r2Key", r2Key);

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/r2-upload`,
        { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: formData }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      const result = await response.json();

      await supabase.from("files").insert({
        id: fileId,
        name: file.name,
        original_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        storage_path: result.r2_key || r2Key,
        vault_id: pVault.id,
        organization_id: profile.organization_id!,
        uploaded_by: profile.id,
        status: "processing",
      });

      // Trigger document processor (fire & forget)
      supabase.functions.invoke("document-processor", { body: { fileId } }).catch(() => {});

      fileIds.push(fileId);
      fileNames.push(file.name);
    }

    return { fileIds, fileNames, vaultId: pVault.id };
  };

  // Load conversation from URL ?id=
  useEffect(() => {
    const convId = searchParams.get("id");
    if (convId && convId !== conversationId && profile?.organization_id) {
      loadConversation(convId);
    }
  }, [searchParams, profile?.organization_id]);

  const loadConversation = async (convId: string) => {
    setIsLoadingConversation(true);
    setEditorDoc(null);
    setSheetDoc(null);
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
          msgs.map((m) => {
            const meta = (m as any).metadata || {};
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              reasoning: meta.frozenReasoning || undefined,
              citations: (m.citations as any) || undefined,
              model: m.model_used || undefined,
              followUps: meta.followUps || undefined,
              frozenSteps: meta.frozenSteps || undefined,
              frozenPlan: meta.frozenPlan || undefined,
              frozenThinkingText: meta.frozenThinkingText || undefined,
              frozenSearchSources: meta.frozenSearchSources || undefined,
              frozenFileRefs: meta.frozenFileRefs || undefined,
              createdAt: new Date(m.created_at),
            };
          })
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
      const wfTag = state.workflowTag || null;
      // Files are now pre-processed in Home.tsx — receive IDs, not File objects
      const preProcessedFileIds: string[] = state.attachedFileIds || [];
      const preProcessedFileNames: string[] = state.attachedFileNames || [];

      setVaultId(vault);
      setVaultName(vName);
      setDeepResearch(deep);
      setActiveSources(srcs);
      setPromptMode(pMode);
      setWorkflowTag(wfTag);

      navigate("/chat", { replace: true, state: {} });

      if (preProcessedFileIds.length > 0) {
        // Files already uploaded in Home.tsx, just pass IDs
        const effectiveVault = vault || (state.selectedVault?.id);
        const effectiveVaultName = vName || "Uploads";
        setVaultId(effectiveVault);
        setVaultName(effectiveVaultName);
        // Track attached file IDs for subsequent messages
        setConversationAttachedFileIds(preProcessedFileIds);
        createConversationAndSend(msg, effectiveVault, deep, srcs, pMode, effectiveVaultName, wfTag?.systemPrompt, preProcessedFileIds, preProcessedFileNames);
      } else {
        createConversationAndSend(msg, vault, deep, srcs, pMode, vName, wfTag?.systemPrompt);
      }
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
    setReplyContext(selectionTooltip.text);
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
    vName?: string,
    workflowSystemPrompt?: string,
    attachedFileIds?: string[],
    attachedFileNames?: string[],
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
      currentSheetState: sheetDoc,
      workflowSystemPrompt: workflowSystemPrompt || workflowTag?.systemPrompt,
      currentDocumentContent: editorDoc?.content,
      attachedFileIds,
      attachedFileNames,
    };
    lastStreamOptions.current = opts;
    sendMessage(msg, opts);
  };

  const handleSend = async (text?: string) => {
    let msg = (text || input).trim();
    if (!msg || isStreaming) return;
    // Prepend reply context if present
    if (replyContext && !text) {
      msg = `Regarding: "${replyContext.slice(0, 200)}"\n\n${msg}`;
      setReplyContext(null);
    }
    if (!profile?.organization_id) {
      toast({ title: "Not ready", description: "Your profile is still loading. Please wait a moment.", variant: "destructive" });
      return;
    }
    if (!text) setInput("");

    if (!conversationId) {
      await createConversationAndSend(msg, vaultId, deepResearch, activeSources, promptMode);
    } else {
      const opts: any = {
        conversationId,
        organizationId: profile.organization_id!,
        vaultId,
        vaultName,
        deepResearch,
        sources: activeSources,
        useCase: promptMode,
        currentSheetState: sheetDoc,
        workflowSystemPrompt: workflowTag?.systemPrompt,
        currentDocumentContent: editorDoc?.content,
      };
      // For Uploads vault, scope to the originally attached files
      if (vaultName === "Uploads" && conversationAttachedFileIds.length > 0) {
        opts.attachedFileIds = conversationAttachedFileIds;
      }
      lastStreamOptions.current = opts;
      sendMessage(msg, opts);
    }
  };

  const handleChoiceSelect = useCallback((text: string) => {
    handleSend(text);
  }, [conversationId, profile?.organization_id, vaultId, deepResearch, activeSources, promptMode, isStreaming]);

  const handleDocumentOpen = useCallback((title: string, content: string) => {
    const container = scrollContainerRef.current;
    const viewport = container?.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const scrollTop = viewport?.scrollTop || 0;

    setEditorDoc(
      editorDoc?.title === title ? null : { title, content }
    );

    requestAnimationFrame(() => {
      if (viewport) viewport.scrollTop = scrollTop;
    });
  }, [editorDoc]);

  const handleSheetOpen = useCallback((data: SheetData) => {
    const container = scrollContainerRef.current;
    const viewport = container?.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const scrollTop = viewport?.scrollTop || 0;
    
    // If same title, merge as new version
    if (sheetDoc && sheetDoc.title === data.title && JSON.stringify(sheetDoc) !== JSON.stringify(data)) {
      setSheetDoc(data); // SheetEditor will auto-version
    } else {
      setSheetDoc(sheetDoc?.title === data.title ? null : data);
    }
    setEditorDoc(null);
    requestAnimationFrame(() => {
      if (viewport) viewport.scrollTop = scrollTop;
    });
  }, [sheetDoc]);

  const handleFileClick = useCallback(async (fileName: string, fileId?: string) => {
    if (!profile?.organization_id) return;
    // Try to fetch file content by ID or name
    const query = supabase.from("files").select("name, extracted_text").eq("organization_id", profile.organization_id);
    if (fileId) {
      query.eq("id", fileId);
    } else {
      query.eq("name", fileName);
    }
    const { data } = await query.maybeSingle();
    if (data?.extracted_text) {
      handleDocumentOpen(data.name || fileName, data.extracted_text);
    }
  }, [profile?.organization_id, handleDocumentOpen]);

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
    setConversationAttachedFileIds([]);
    initialMessageSentRef.current = false;
    clearMessages();
    navigate("/chat", { replace: true });
  };

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

  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareEmails, setShareEmails] = useState("");
  const [isSharingLoading, setIsSharingLoading] = useState(false);

  const handleShare = async () => {
    if (!conversationId) return;
    setShowShareDialog(true);
  };

  const handleShareSubmit = async () => {
    if (!conversationId || !shareEmails.trim()) return;
    setIsSharingLoading(true);
    try {
      const emails = shareEmails.split(/[,;\n]+/).map(e => e.trim().toLowerCase()).filter(Boolean);
      if (emails.length === 0) return;

      const inserts = emails.map(email => ({
        conversation_id: conversationId,
        shared_with_email: email,
        shared_by: profile?.id,
      }));

      const { error: shareErr } = await supabase
        .from("conversation_shares" as any)
        .upsert(inserts as any, { onConflict: "conversation_id,shared_with_email" });

      if (shareErr) {
        toast({ title: "Error", description: shareErr.message, variant: "destructive" });
        return;
      }

      toast({ title: "Shared!", description: `Conversation shared with ${emails.length} user${emails.length > 1 ? 's' : ''}` });
      setShareEmails("");
      setShowShareDialog(false);
    } finally {
      setIsSharingLoading(false);
    }
  };

  const allCitations: Citation[] = messages
    .filter((m) => m.role === "assistant" && m.citations)
    .flatMap((m) => m.citations || []);

  const lastAssistantIdx = messages.reduce((acc, m, i) => m.role === "assistant" ? i : acc, -1);
  const lastUserIdx = messages.reduce((acc, m, i) => m.role === "user" ? i : acc, -1);

  const lastMsg = messages[messages.length - 1];
  const showStreamingIndicator = isStreaming && lastMsg?.role === "user";

  const rightPanel = sheetDoc ? (
    <SheetEditor
      data={sheetDoc}
      onClose={() => {
        const container = scrollContainerRef.current;
        const viewport = container?.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const scrollTop = viewport?.scrollTop || 0;
        setSheetDoc(null);
        requestAnimationFrame(() => {
          if (viewport) viewport.scrollTop = scrollTop;
        });
      }}
      onUpdate={(updated) => setSheetDoc(updated)}
    />
  ) : editorDoc ? (
    <DocumentEditor
      title={editorDoc.title}
      content={editorDoc.content}
      onClose={() => {
        const container = scrollContainerRef.current;
        const viewport = container?.querySelector?.('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        const scrollTop = viewport?.scrollTop || 0;
        setEditorDoc(null);
        requestAnimationFrame(() => {
          if (viewport) viewport.scrollTop = scrollTop;
        });
      }}
    />
  ) : undefined;

  return (
    <AppLayout rightPanel={rightPanel}>
      <div className="flex h-full">
        <div className="flex flex-1 flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground">Assist</span>
              <span className="text-xs text-muted-foreground">·</span>
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
                  {promptMode === "red_flags" ? "Red Flag" : promptMode === "drafting" ? "Drafting" : promptMode === "review" ? "Review Table" : "Chat"}
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

                  const isCurrentlyStreaming = isStreaming && msg.role === "assistant" && i === messages.length - 1;
                  
                  // For the currently streaming message, use live steps. For older messages, use frozen steps.
                  const msgSteps = isCurrentlyStreaming ? steps : msg.frozenSteps;
                  const msgPlan = isCurrentlyStreaming ? plan : msg.frozenPlan;
                  const msgThinking = isCurrentlyStreaming ? thinkingText : msg.frozenThinkingText;
                  const msgFileRefs = isCurrentlyStreaming ? fileRefs : msg.frozenFileRefs;
                  const msgSearchSources = isCurrentlyStreaming ? searchSources : msg.frozenSearchSources;

                  return (
                    <div key={msg.id}>
                      <MessageBubble
                        message={msg}
                        nextMessage={nextMsg}
                        isStreaming={isCurrentlyStreaming}
                        onRegenerate={msg.role === "assistant" ? handleRegenerate : undefined}
                        onChoiceSelect={handleChoiceSelect}
                        onDocumentOpen={handleDocumentOpen}
                        onSheetOpen={handleSheetOpen}
                        isLastAssistant={isLastAssistant}
                        steps={msgSteps}
                        isStreamingSteps={isCurrentlyStreaming}
                        searchSources={msgSearchSources}
                        onFollowUp={handleChoiceSelect}
                        plan={msgPlan}
                        thinkingText={msgThinking}
                        fileRefs={msgFileRefs}
                        conversationId={conversationId || undefined}
                        inlineData={isCurrentlyStreaming ? inlineData : msg.frozenInlineData}
                        contradictions={isCurrentlyStreaming ? contradictions : msg.frozenContradictions}
                        verifications={isCurrentlyStreaming ? verifications : msg.frozenVerifications}
                        escalations={isCurrentlyStreaming ? escalations : msg.frozenEscalations}
                        selfCheckStatus={isCurrentlyStreaming ? selfCheckStatus : null}
                        intent={isCurrentlyStreaming ? intent : msg.frozenIntent}
                        planUpdateReason={isCurrentlyStreaming ? planUpdateReason : null}
                        progress={isCurrentlyStreaming ? progress : null}
                        onFileClick={handleFileClick}
                      />

                      {isLastUser && showStreamingIndicator && (
                        <div className="mt-6">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                            <span className="text-xs font-semibold text-foreground">LawKit AI</span>
                          </div>
                          <div className="pl-8">
                            {steps.length > 0 || plan.length > 0 ? (
                              <StepTracker
                                steps={steps}
                                isStreaming={true}
                                searchSources={searchSources}
                                plan={plan}
                                thinkingText={thinkingText}
                                fileRefs={fileRefs}
                                inlineData={inlineData}
                                contradictions={contradictions}
                                verifications={verifications}
                                escalations={escalations}
                                selfCheckStatus={selfCheckStatus}
                                intent={intent}
                                planUpdateReason={planUpdateReason}
                                progress={progress}
                              />
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

          <div className="px-6 py-4">
            <div className="mx-auto max-w-3xl">
            <ChatInput
                value={input}
                onChange={setInput}
                onSend={() => handleSend()}
                disabled={isStreaming || !profile?.organization_id}
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
                workflowTag={workflowTag}
                onWorkflowTagRemove={() => setWorkflowTag(null)}
                replyContext={replyContext}
                onRemoveReply={() => setReplyContext(null)}
                isProcessingFiles={isProcessingFiles}
                onFilesAttach={async (files) => {
                  setIsProcessingFiles(true);
                  try {
                    const result = await processAttachedFiles(files);
                    setConversationAttachedFileIds(prev => [...prev, ...result.fileIds]);
                    setVaultId(result.vaultId);
                    setVaultName("Uploads");
                    toast({ title: "Files attached", description: `${files.length} file${files.length > 1 ? 's' : ''} uploaded and processing.` });
                  } catch (err: any) {
                    toast({ title: "Upload failed", description: err.message, variant: "destructive" });
                  } finally {
                    setIsProcessingFiles(false);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {showSources && allCitations.length > 0 && (
          <SourcesPanel
            citations={allCitations}
            onClose={() => setShowSources(false)}
          />
        )}
      </div>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share className="h-4 w-4" />
              Share Conversation
            </DialogTitle>
            <DialogDescription>
              Enter email addresses to share this conversation. Users will see it in their recent chats.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Enter emails separated by commas or new lines..."
              value={shareEmails}
              onChange={(e) => setShareEmails(e.target.value)}
              className="min-h-[80px] text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Shared users can view this conversation and its messages.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowShareDialog(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleShareSubmit}
              disabled={!shareEmails.trim() || isSharingLoading}
              className="gap-1.5"
            >
              {isSharingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
              Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
