import { useState, useRef, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  model?: string;
  createdAt: Date;
}

export interface AgentStep {
  name: string;
  status: "done" | "working";
}

export interface Citation {
  index: number;
  source: string;
  excerpt: string;
}

interface StreamChatOptions {
  conversationId: string;
  organizationId: string;
  vaultId?: string;
  deepResearch?: boolean;
  attachedFileIds?: string[];
  sources?: string[];
  useCase?: string; // "red_flag" | "review" | "chat" — hints Perplexity model selection
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-router`;

export function useStreamChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadHistory = useCallback((history: ChatMessage[]) => {
    setMessages(history);
  }, []);

  const sendMessage = useCallback(
    async (content: string, options: StreamChatOptions) => {
      setError(null);
      setSteps([]);
      setIsStreaming(true);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { data: sessionData } = await (await import("@/integrations/supabase/client")).supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            conversationId: options.conversationId,
            message: content,
            vaultId: options.vaultId,
            deepResearch: options.deepResearch,
            attachedFileIds: options.attachedFileIds,
            sources: options.sources,
            useCase: options.useCase,
            history,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({ error: "Request failed" }));
          setError(errBody.error || `Error ${resp.status}`);
          setIsStreaming(false);
          return;
        }

        if (!resp.body) {
          setError("No response body");
          setIsStreaming(false);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        let assistantId = crypto.randomUUID();
        let buffer = "";
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            let line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }

            try {
              const parsed = JSON.parse(jsonStr);

              if (parsed.type === "steps") {
                setSteps(parsed.steps);
              } else if (parsed.type === "token") {
                assistantContent += parsed.content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    return prev.map((m, i) =>
                      i === prev.length - 1 ? { ...m, content: assistantContent } : m
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: "assistant" as const,
                      content: assistantContent,
                      createdAt: new Date(),
                    },
                  ];
                });
              } else if (parsed.type === "done") {
                // Update with citations
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, citations: parsed.citations, model: parsed.model }
                      : m
                  )
                );
                // Mark all steps as done
                setSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
              } else if (parsed.type === "error") {
                setError(parsed.error);
              }
            } catch {
              // Skip unparseable lines instead of re-buffering (prevents infinite loops)
              continue;
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message || "Stream failed");
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSteps([]);
    setError(null);
  }, []);

  return {
    messages,
    steps,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
    loadHistory,
  };
}
