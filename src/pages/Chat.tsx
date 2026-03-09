import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatInput } from "@/components/chat/ChatInput";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { StepTracker } from "@/components/chat/StepTracker";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
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

const INTERNAL_PROVIDERS = ["cloudflare_r2", "agent_config", "knowledge_document"];

export default function Chat() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    steps,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
  } = useStreamChat();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState("New Conversation");
  const [input, setInput] = useState("");
  const [showSources, setShowSources] = useState(false);
  const [vaultId, setVaultId] = useState<string | undefined>();
  const [deepResearch, setDeepResearch] = useState(false);
  const [integrations, setIntegrations] = useState<{ name: string; provider: string }[]>([]);

  // Handle initial message from Home page
  useEffect(() => {
    const state = location.state as any;
    if (state?.initialMessage && profile?.organization_id) {
      const msg = state.initialMessage;
      setVaultId(state.selectedVault?.id);
      setDeepResearch(state.deepResearch || false);
      navigate("/chat", { replace: true, state: {} });
      createConversationAndSend(msg, state.selectedVault?.id, state.deepResearch);
    }
  }, [location.state, profile?.organization_id]);

  // Load integrations (filter out internal ones)
  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from("api_integrations")
      .select("name, provider")
      .eq("organization_id", profile.organization_id!)
      .eq("is_active", true)
      .then(({ data }) => {
        const filtered = (data || []).filter(
          (i) => !INTERNAL_PROVIDERS.includes(i.provider)
        );
        setIntegrations(filtered);
      });
  }, [profile?.organization_id]);

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
    deep?: boolean
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
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !profile?.organization_id) return;
    const msg = input.trim();
    setInput("");

    if (!conversationId) {
      await createConversationAndSend(msg, vaultId, deepResearch);
    } else {
      sendMessage(msg, {
        conversationId,
        organizationId: profile.organization_id!,
        vaultId,
        deepResearch,
      });
    }
  };

  const handleNewThread = () => {
    setConversationId(null);
    setConversationTitle("New Conversation");
    clearMessages();
  };

  // Collect all citations
  const allCitations: Citation[] = messages
    .filter((m) => m.role === "assistant" && m.citations)
    .flatMap((m) => m.citations || []);

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
                    {/* Show step tracker after user message, before assistant response */}
                    {msg.role === "user" &&
                      i === messages.length - 1 &&
                      steps.length > 0 && (
                        <div className="pl-8 mt-4">
                          <StepTracker steps={steps} isStreaming={isStreaming} />
                        </div>
                      )}
                    {msg.role === "user" &&
                      i < messages.length - 1 &&
                      messages[i + 1]?.role === "assistant" &&
                      steps.length > 0 &&
                      i === messages.length - 2 && (
                        <div className="pl-8 mt-4 mb-4">
                          <StepTracker steps={steps} isStreaming={isStreaming} />
                        </div>
                      )}
                  </div>
                ))}

                {/* Step tracker when no assistant message yet */}
                {steps.length > 0 &&
                  messages.length > 0 &&
                  messages[messages.length - 1].role === "user" &&
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

          {/* Input — clean floating style */}
          <div className="px-6 py-4">
            <div className="mx-auto max-w-3xl">
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                disabled={isStreaming}
                integrations={integrations}
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
