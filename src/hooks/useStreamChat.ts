import { useState, useRef, useCallback } from "react";

export interface MessageAttachments {
  vaultName?: string;
  vaultId?: string;
  fileNames?: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  citations?: Citation[];
  model?: string;
  followUps?: string[];
  attachments?: MessageAttachments;
  createdAt: Date;
}

export interface AgentStep {
  name: string;
  status: "done" | "working";
  detail?: string;
  duration?: string;
  substeps?: { name: string; status: string }[];
  startedAt?: number;
}

export interface Citation {
  index: number;
  source: string;
  excerpt: string;
  url?: string;
}

export interface SearchSource {
  urls: string[];
  domains: string[];
}

export interface FileRef {
  name: string;
  id?: string;
}

interface StreamChatOptions {
  conversationId: string;
  organizationId: string;
  vaultId?: string;
  vaultName?: string;
  deepResearch?: boolean;
  attachedFileIds?: string[];
  attachedFileNames?: string[];
  sources?: string[];
  useCase?: string;
  promptMode?: string;
  currentSheetState?: any;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/llm-router`;

export function useStreamChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [searchSources, setSearchSources] = useState<SearchSource | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string[]>([]);
  const [thinkingText, setThinkingText] = useState("");
  const [fileRefs, setFileRefs] = useState<FileRef[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMsgRef = useRef<string>("");
  const stepTimers = useRef<Map<string, number>>(new Map());

  const loadHistory = useCallback((history: ChatMessage[]) => {
    setMessages(history);
  }, []);

  const sendMessage = useCallback(
    async (content: string, options: StreamChatOptions) => {
      setError(null);
      setSteps([]);
      setSearchSources(null);
      setPlan([]);
      setThinkingText("");
      setFileRefs([]);
      setIsStreaming(true);
      lastUserMsgRef.current = content;
      stepTimers.current.clear();

      const attachments: MessageAttachments = {};
      if (options.vaultName) attachments.vaultName = options.vaultName;
      if (options.vaultId) attachments.vaultId = options.vaultId;
      if (options.attachedFileNames?.length) attachments.fileNames = options.attachedFileNames;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments: Object.keys(attachments).length > 0 ? attachments : undefined,
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
            vaultName: options.vaultName,
            deepResearch: options.deepResearch,
            attachedFileIds: options.attachedFileIds,
            attachedFileNames: options.attachedFileNames,
            sources: options.sources,
            useCase: options.useCase,
            promptMode: options.promptMode,
            currentSheetState: options.currentSheetState,
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
        let assistantReasoning = "";
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

              if (parsed.type === "plan") {
                setPlan(parsed.steps || []);
              } else if (parsed.type === "steps") {
                setSteps(parsed.steps);
              } else if (parsed.type === "step") {
                setSteps((prev) => {
                  const step = parsed.step as AgentStep;
                  const now = Date.now();
                  
                  const existing = prev.findIndex((s) => s.name === step.name);
                  if (existing !== -1) {
                    // Calculate duration when step completes
                    let duration = step.duration;
                    if (step.status === "done" && !duration) {
                      const startTime = stepTimers.current.get(step.name);
                      if (startTime) {
                        const elapsed = Math.round((now - startTime) / 1000);
                        duration = `${elapsed}s`;
                      }
                    }
                    return prev.map((s, i) => i === existing ? { ...step, duration, startedAt: s.startedAt } : s);
                  }
                  
                  // Track start time for new steps
                  if (step.status === "working") {
                    stepTimers.current.set(step.name, now);
                  }
                  return [...prev, { ...step, startedAt: now }];
                });
                
                // Update plan checkmarks
                if (parsed.step?.status === "done") {
                  setPlan((prevPlan) => [...prevPlan]); // trigger re-render for plan checklist
                }
              } else if (parsed.type === "thinking") {
                setThinkingText((prev) => prev + parsed.content);
              } else if (parsed.type === "file_refs") {
                setFileRefs((prev) => [...prev, ...(parsed.files || [])]);
              } else if (parsed.type === "sources") {
                setSearchSources({ urls: parsed.urls, domains: parsed.domains });
              } else if (parsed.type === "reasoning") {
                assistantReasoning += parsed.content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    return prev.map((m, i) =>
                      i === prev.length - 1 ? { ...m, reasoning: assistantReasoning } : m
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: "assistant" as const,
                      content: "",
                      reasoning: assistantReasoning,
                      createdAt: new Date(),
                    },
                  ];
                });
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, citations: parsed.citations, followUps: parsed.followUps }
                      : m
                  )
                );
                setSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
              } else if (parsed.type === "error") {
                setError(parsed.error);
              }
            } catch {
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

  const regenerateLastMessage = useCallback(
    (options: StreamChatOptions) => {
      setMessages((prev) => {
        const withoutLast = prev[prev.length - 1]?.role === "assistant"
          ? prev.slice(0, -1)
          : prev;
        return withoutLast;
      });

      const lastUserContent = lastUserMsgRef.current;
      if (!lastUserContent) return;

      setMessages((prev) => {
        const lastIdx = prev.length - 1;
        if (prev[lastIdx]?.role === "user") {
          return prev.slice(0, -1);
        }
        return prev;
      });

      setTimeout(() => {
        sendMessage(lastUserContent, options);
      }, 100);
    },
    [sendMessage]
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setSteps([]);
    setSearchSources(null);
    setPlan([]);
    setThinkingText("");
    setFileRefs([]);
    setError(null);
  }, []);

  return {
    messages,
    steps,
    searchSources,
    isStreaming,
    error,
    plan,
    thinkingText,
    fileRefs,
    sendMessage,
    cancelStream,
    clearMessages,
    loadHistory,
    regenerateLastMessage,
  };
}
