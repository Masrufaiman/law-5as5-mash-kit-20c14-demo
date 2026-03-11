import { useState, useRef, useCallback } from "react";

export interface MessageAttachments {
  vaultName?: string;
  vaultId?: string;
  fileNames?: string[];
  promptMode?: string;
  sources?: string[];
  deepResearch?: boolean;
  workflowTitle?: string;
}

export interface InlineDataTable {
  headers: string[];
  rows: string[][];
}

export interface Contradiction {
  claim: string;
  sourceA: string;
  sourceB: string;
}

export interface Verification {
  claim: string;
  status: "checking" | "verified" | "unverified";
  source?: string;
}

export interface Escalation {
  from: string;
  to: string;
  reason: string;
}

export interface IntentData {
  taskType: string;
  jurisdictions: string[];
  complexity: number;
  approach?: string;
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
  // Persisted per-message metadata
  frozenSteps?: AgentStep[];
  frozenPlan?: string[];
  frozenThinkingText?: string;
  frozenSearchSources?: SearchSource | null;
  frozenFileRefs?: FileRef[];
  frozenInlineData?: InlineDataTable[];
  frozenContradictions?: Contradiction[];
  frozenVerifications?: Verification[];
  frozenEscalations?: Escalation[];
  frozenIntent?: IntentData;
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
  workflowSystemPrompt?: string;
  currentDocumentContent?: string;
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
  const [inlineData, setInlineData] = useState<InlineDataTable[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [selfCheckStatus, setSelfCheckStatus] = useState<string | null>(null);
  const [intent, setIntent] = useState<IntentData | null>(null);
  const [planUpdateReason, setPlanUpdateReason] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

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
      setInlineData([]);
      setContradictions([]);
      setVerifications([]);
      setEscalations([]);
      setSelfCheckStatus(null);
      setIntent(null);
      setPlanUpdateReason(null);
      setProgress(null);
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

      // Live accumulators for freezing
      let liveSteps: AgentStep[] = [];
      let livePlan: string[] = [];
      let liveThinkingText = "";
      let liveSearchSources: SearchSource | null = null;
      let liveFileRefs: FileRef[] = [];
      let liveInlineData: InlineDataTable[] = [];
      let liveContradictions: Contradiction[] = [];
      let liveVerifications: Verification[] = [];
      let liveEscalations: Escalation[] = [];
      let liveIntent: IntentData | null = null;

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
            workflowSystemPrompt: options.workflowSystemPrompt,
            currentDocumentContent: options.currentDocumentContent,
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
            if (jsonStr === "[DONE]") { streamDone = true; break; }

            try {
              const parsed = JSON.parse(jsonStr);

              switch (parsed.type) {
                case "plan":
                  livePlan = parsed.steps || [];
                  setPlan(livePlan);
                  break;

                case "plan_update":
                  livePlan = parsed.steps || [];
                  setPlan(livePlan);
                  setPlanUpdateReason(parsed.reason || null);
                  break;

                case "step": {
                  const step = parsed.step as AgentStep;
                  const now = Date.now();
                  setSteps((prev) => {
                    const existing = prev.findIndex((s) => s.name === step.name);
                    if (existing !== -1) {
                      let duration = step.duration;
                      if (step.status === "done" && !duration) {
                        const startTime = stepTimers.current.get(step.name);
                        if (startTime) duration = `${Math.round((now - startTime) / 1000)}s`;
                      }
                      const updated = prev.map((s, i) => i === existing ? { ...step, duration, startedAt: s.startedAt } : s);
                      liveSteps = updated;
                      return updated;
                    }
                    if (step.status === "working") stepTimers.current.set(step.name, now);
                    const updated = [...prev, { ...step, startedAt: now }];
                    liveSteps = updated;
                    return updated;
                  });
                  break;
                }

                case "thinking":
                  liveThinkingText += parsed.content;
                  setThinkingText(liveThinkingText);
                  break;

                case "file_refs":
                  liveFileRefs = [...liveFileRefs, ...(parsed.files || [])];
                  setFileRefs(liveFileRefs);
                  break;

                case "sources":
                  liveSearchSources = { urls: parsed.urls, domains: parsed.domains };
                  setSearchSources(liveSearchSources);
                  break;

                case "intent":
                  liveIntent = parsed.data;
                  setIntent(parsed.data);
                  break;

                case "escalation":
                  liveEscalations = [...liveEscalations, parsed.data];
                  setEscalations(liveEscalations);
                  break;

                case "contradiction":
                  liveContradictions = [...liveContradictions, parsed.data];
                  setContradictions(liveContradictions);
                  break;

                case "verify_start":
                  liveVerifications = [...liveVerifications, { claim: parsed.claim, status: "checking" }];
                  setVerifications([...liveVerifications]);
                  break;

                case "verify_end": {
                  const idx = liveVerifications.findIndex(v => v.claim === parsed.claim);
                  if (idx >= 0) {
                    liveVerifications[idx] = {
                      claim: parsed.claim,
                      status: parsed.verified ? "verified" : "unverified",
                      source: parsed.source,
                    };
                    setVerifications([...liveVerifications]);
                  }
                  break;
                }

                case "inline_data":
                  liveInlineData = [...liveInlineData, parsed.data];
                  setInlineData(liveInlineData);
                  break;

                case "self_check":
                  setSelfCheckStatus(parsed.status);
                  break;

                case "progress":
                  setProgress({ current: parsed.current, total: parsed.total });
                  break;

                case "final_answer_start":
                  // Marker for UI — no action needed, handled by token rendering
                  break;

                case "reasoning":
                  assistantReasoning += parsed.content;
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.id === assistantId) {
                      return prev.map((m, i) => i === prev.length - 1 ? { ...m, reasoning: assistantReasoning } : m);
                    }
                    return [...prev, { id: assistantId, role: "assistant" as const, content: "", reasoning: assistantReasoning, createdAt: new Date() }];
                  });
                  break;

                case "token":
                  assistantContent += parsed.content;
                  setMessages((prev) => {
                    const last = prev[prev.length - 1];
                    if (last?.role === "assistant" && last.id === assistantId) {
                      return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                    }
                    return [...prev, { id: assistantId, role: "assistant" as const, content: assistantContent, createdAt: new Date() }];
                  });
                  break;

                case "done": {
                  const frozenMeta = {
                    frozenSteps: liveSteps.map(s => ({ ...s, status: "done" as const })),
                    frozenPlan: livePlan,
                    frozenThinkingText: liveThinkingText,
                    frozenSearchSources: liveSearchSources,
                    frozenFileRefs: liveFileRefs,
                    frozenInlineData: liveInlineData.length > 0 ? liveInlineData : undefined,
                    frozenContradictions: liveContradictions.length > 0 ? liveContradictions : undefined,
                    frozenVerifications: liveVerifications.length > 0 ? liveVerifications : undefined,
                    frozenEscalations: liveEscalations.length > 0 ? liveEscalations : undefined,
                    frozenIntent: liveIntent || undefined,
                    followUps: parsed.followUps,
                  };
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, citations: parsed.citations, followUps: parsed.followUps, ...frozenMeta } : m
                    )
                  );
                  setSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
                  break;
                }

                case "error":
                  setError(parsed.error);
                  break;
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
        const withoutLast = prev[prev.length - 1]?.role === "assistant" ? prev.slice(0, -1) : prev;
        return withoutLast;
      });
      const lastUserContent = lastUserMsgRef.current;
      if (!lastUserContent) return;
      setMessages((prev) => {
        if (prev[prev.length - 1]?.role === "user") return prev.slice(0, -1);
        return prev;
      });
      setTimeout(() => { sendMessage(lastUserContent, options); }, 100);
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
    setInlineData([]);
    setContradictions([]);
    setVerifications([]);
    setEscalations([]);
    setSelfCheckStatus(null);
    setIntent(null);
    setPlanUpdateReason(null);
    setProgress(null);
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
  };
}
