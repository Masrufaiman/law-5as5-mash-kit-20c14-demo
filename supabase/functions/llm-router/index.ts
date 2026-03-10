import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ChatRequest {
  conversationId: string;
  message: string;
  vaultId?: string;
  deepResearch?: boolean;
  attachedFileIds?: string[];
  attachedFileNames?: string[];
  sources?: string[];
  history?: { role: string; content: string }[];
  useCase?: string;
  vaultName?: string;
  promptMode?: string;
}

// ---------- Multi-model Perplexity selection ----------
const MODEL_CONFIG: Record<string, { maxTokens: number; systemPrompt: string }> = {
  sonar: {
    maxTokens: 2048,
    systemPrompt: "You are a legal research assistant. Provide concise, accurate legal information with proper citations from authoritative sources.",
  },
  "sonar-reasoning": {
    maxTokens: 4096,
    systemPrompt: "You are a legal risk analysis expert. Analyze contracts and documents for risks, red flags, and problematic clauses. Reason step-by-step through each issue, citing specific clauses and legal precedents.",
  },
  "sonar-pro": {
    maxTokens: 4096,
    systemPrompt: "You are a legal data extraction specialist. Extract structured data with maximum citations. Be thorough and cite every claim. Provide comprehensive coverage with source URLs.",
  },
  "sonar-deep-research": {
    maxTokens: 8192,
    systemPrompt: "You are a senior legal researcher conducting comprehensive multi-source legal research. Analyze multiple jurisdictions, compare legal frameworks, and provide exhaustive citations.",
  },
};

function selectPerplexityModel(message: string, deepResearch: boolean, useCase?: string): string {
  if (deepResearch) return "sonar-deep-research";
  if (useCase === "red_flag") return "sonar-reasoning";
  if (useCase === "review") return "sonar-pro";

  const lower = message.toLowerCase();
  if (/red.?flag|risk.?analy|clause.?review|compliance.?check|due.?diligence|problematic|risky|liability/i.test(lower)) {
    return "sonar-reasoning";
  }
  if (/review.?table|compar|extract.?terms|obligation|provision|summar.*clause|side.?by.?side|benchmark/i.test(lower)) {
    return "sonar-pro";
  }
  return "sonar";
}

const SOURCE_DOMAIN_MAP: Record<string, string[]> = {
  "EDGAR (SEC)": ["sec.gov", "edgar.sec.gov"],
  "CourtListener": ["courtlistener.com"],
  "EUR-Lex": ["eur-lex.europa.eu"],
  "WorldLII": ["worldlii.org"],
  "US Law": ["law.cornell.edu", "supremecourt.gov", "uscourts.gov"],
  "UK Law": ["legislation.gov.uk", "judiciary.uk", "bailii.org"],
  "Indian Law": ["indiankanoon.org", "sci.gov.in"],
  "Canadian Law": ["canlii.org", "laws-lois.justice.gc.ca"],
  "Australian Law": ["austlii.edu.au", "legislation.gov.au"],
  "French Law": ["legifrance.gouv.fr"],
  "German Law": ["gesetze-im-internet.de"],
  "Brazilian Law": ["planalto.gov.br"],
  "Singapore Law": ["sso.agc.gov.sg", "elitigation.sg"],
  "UAE Law": ["tamimi.com"],
  "Italian Law": ["normattiva.it"],
  "Web Search": [],
};

// Helper to emit a single SSE step event
function emitStep(controller: ReadableStreamDefaultController, encoder: TextEncoder, step: { name: string; status: string }) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "step", step })}\n\n`)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id, full_name, email")
      .eq("id", userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "No organization found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = profile.organization_id;
    const body: ChatRequest = await req.json();
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, attachedFileNames, sources, history, useCase, vaultName: clientVaultName, promptMode } = body;

    // Load org info for personalization
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    // Load agent config
    const { data: agentConfig } = await adminClient
      .from("api_integrations")
      .select("config")
      .eq("organization_id", orgId)
      .eq("provider", "agent_config")
      .maybeSingle();

    const agentConf = (agentConfig?.config as any) || {};
    const qdrantConf = agentConf.qdrant || {};
    const openaiConf = agentConf.openai || {};
    const embeddingModel = agentConf.document_analysis?.embedding_model || "text-embedding-3-small";

    // ---- SERVER-SIDE CONVERSATION HISTORY (Issue #2, #12) ----
    let conversationHistory: { role: string; content: string }[] = [];
    if (conversationId) {
      const { data: dbMessages } = await adminClient
        .from("messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(20);
      if (dbMessages?.length) {
        conversationHistory = dbMessages.map((m: any) => ({ role: m.role, content: m.content }));
      }
    }
    // Fallback to client-sent history for new conversations
    if (conversationHistory.length === 0 && history?.length) {
      conversationHistory = history;
    }

    // Create SSE response - we stream steps progressively
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // ---- IMMEDIATE STEP: Analyzing query ----
          emitStep(controller, encoder, { name: "Analyzing your query", status: "working" });

          // Load knowledge base
          const { data: knowledgeEntries } = await adminClient
            .from("knowledge_entries")
            .select("title, content, category")
            .or(`organization_id.eq.${orgId},is_global.eq.true`);

          let knowledgeContext = "";
          if (knowledgeEntries?.length) {
            knowledgeContext = "\n\n## Knowledge Base\n" +
              knowledgeEntries.map((e: any) => `### ${e.title} (${e.category || "general"})\n${e.content}`).join("\n\n");
            emitStep(controller, encoder, { name: "Analyzing your query", status: "done" });
            emitStep(controller, encoder, { name: `Loaded ${knowledgeEntries.length} knowledge entries`, status: "done" });
          } else {
            emitStep(controller, encoder, { name: "Analyzing your query", status: "done" });
          }

          // --- RAG: Qdrant vector search ---
          let ragContext = "";
          let ragCitations: { index: number; source: string; excerpt: string }[] = [];

          if ((vaultId || attachedFileIds?.length) && qdrantConf.url && qdrantConf.api_key && openaiConf.api_key) {
            emitStep(controller, encoder, { name: "Searching your documents", status: "working" });

            try {
              const queryEmbedding = await embedQuery(message, openaiConf.api_key, embeddingModel);
              const collectionName = `${qdrantConf.collection_prefix || "org_"}${orgId}`;

              const mustFilters: any[] = [];
              if (vaultId) {
                const { data: vaultFiles } = await adminClient
                  .from("files")
                  .select("id")
                  .eq("vault_id", vaultId)
                  .eq("organization_id", orgId);

                if (vaultFiles?.length) {
                  mustFilters.push({
                    key: "file_id",
                    match: { any: vaultFiles.map((f: any) => f.id) },
                  });
                }
              }
              if (attachedFileIds?.length) {
                mustFilters.push({
                  key: "file_id",
                  match: { any: attachedFileIds },
                });
              }

              const searchResp = await fetch(`${qdrantConf.url}/collections/${collectionName}/points/search`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "api-key": qdrantConf.api_key,
                },
                body: JSON.stringify({
                  vector: queryEmbedding,
                  limit: 8,
                  with_payload: true,
                  filter: { must: mustFilters },
                }),
              });

              if (searchResp.ok) {
                const searchData = await searchResp.json();
                const results = searchData.result || [];

                if (results.length > 0) {
                  ragContext = "\n\n## Relevant Document Chunks\n";
                  results.forEach((r: any, i: number) => {
                    const p = r.payload || {};
                    ragContext += `### [${i + 1}] ${p.file_name || "Unknown"} (chunk ${p.chunk_index})\n${p.content}\n\n`;
                    ragCitations.push({
                      index: i + 1,
                      source: p.file_name || "Document",
                      excerpt: (p.content || "").substring(0, 200),
                    });
                  });
                  emitStep(controller, encoder, { name: `Found ${results.length} relevant sections`, status: "done" });
                } else {
                  emitStep(controller, encoder, { name: "No matching sections found", status: "done" });
                }
              } else {
                const errText = await searchResp.text();
                console.error("Qdrant search failed:", searchResp.status, errText);
                emitStep(controller, encoder, { name: "Reading documents directly", status: "done" });
              }
            } catch (ragErr: any) {
              console.error("RAG error:", ragErr.message);
              emitStep(controller, encoder, { name: "Reading documents directly", status: "done" });
            }
          }

          // Load vault name for context
          let vaultName = "";
          if (vaultId) {
            const { data: vaultData } = await adminClient.from("vaults").select("name").eq("id", vaultId).single();
            vaultName = vaultData?.name || "";
          }

          // Fallback: direct file text if no Qdrant results
          let vaultContext = "";
          if (!ragContext && (vaultId || attachedFileIds?.length)) {
            emitStep(controller, encoder, { name: "Reading vault documents", status: "working" });
            const fileQuery = adminClient.from("files").select("id, name, extracted_text, extracted_text_r2_key, status").eq("organization_id", orgId);
            if (vaultId) fileQuery.eq("vault_id", vaultId);
            if (attachedFileIds?.length) fileQuery.in("id", attachedFileIds);
            const { data: files } = await fileQuery.not("extracted_text", "is", null).limit(10);

            if (files?.length) {
              vaultContext = "\n\n## Relevant Documents\n" +
                files
                  .filter((f: any) => f.extracted_text)
                  .map((f: any, i: number) => `### [${i + 1}] ${f.name}\n${f.extracted_text?.substring(0, 15000)}`)
                  .join("\n\n");
              emitStep(controller, encoder, { name: `Analyzed ${files.length} documents`, status: "done" });
            } else {
              emitStep(controller, encoder, { name: "No documents found", status: "done" });
            }
          }

          // ---- PERPLEXITY SEARCH ----
          let perplexityContext = "";
          let perplexityCitations: { index: number; source: string; excerpt: string; url?: string }[] = [];
          const needsSearch = (sources && sources.length > 0) || deepResearch;
          let searchSourceDomains: string[] = [];

          if (needsSearch) {
            const pplxModel = selectPerplexityModel(message, !!deepResearch, useCase);

            // User-friendly step labels — NEVER expose model names
            const stepLabel = deepResearch
              ? "Deep analysis across 25+ sources"
              : "Researching relevant sources";
            emitStep(controller, encoder, { name: stepLabel, status: "working" });

            const pplxConfig = MODEL_CONFIG[pplxModel] || MODEL_CONFIG.sonar;

            const { data: perplexityConfig } = await adminClient
              .from("api_integrations")
              .select("api_key_encrypted, config")
              .eq("organization_id", orgId)
              .eq("provider", "perplexity")
              .eq("is_active", true)
              .maybeSingle();

            if (perplexityConfig?.api_key_encrypted) {
              try {
                const perplexityKey = atob(perplexityConfig.api_key_encrypted);

                const domainFilter: string[] = [];
                if (sources) {
                  for (const s of sources) {
                    const domains = SOURCE_DOMAIN_MAP[s];
                    if (domains && domains.length > 0) {
                      domainFilter.push(...domains);
                    }
                  }
                }

                let searchQuery = message;
                if (sources && sources.length > 0) {
                  const jurisdictionNames = sources.filter(s => s !== "Web Search");
                  if (jurisdictionNames.length > 0) {
                    searchQuery = `${message}\n\nFocus on: ${jurisdictionNames.join(", ")}`;
                  }
                }

                const pplxBody: any = {
                  model: pplxModel,
                  messages: [
                    { role: "system", content: pplxConfig.systemPrompt },
                    { role: "user", content: searchQuery },
                  ],
                  max_tokens: pplxConfig.maxTokens,
                };

                if (domainFilter.length > 0) {
                  pplxBody.search_domain_filter = domainFilter.slice(0, 5);
                }

                const pplxResp = await fetch("https://api.perplexity.ai/chat/completions", {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${perplexityKey}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(pplxBody),
                });

                if (pplxResp.ok) {
                  const pplxData = await pplxResp.json();
                  const pplxContent = pplxData.choices?.[0]?.message?.content || "";
                  const pplxCitationUrls: string[] = pplxData.citations || [];

                  perplexityContext = `\n\n## Research Results\n${pplxContent}`;

                  if (pplxCitationUrls.length > 0) {
                    // Re-index starting AFTER ragCitations count (sequential: ragCount+1, ragCount+2, ...)
                    const startIdx = ragCitations.length;
                    perplexityContext += "\n\n### Sources:\n" +
                      pplxCitationUrls.map((url: string, i: number) => `[${startIdx + i + 1}] ${url}`).join("\n");

                    perplexityCitations = pplxCitationUrls.map((url: string, i: number) => {
                      let domain = url;
                      try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
                      return {
                        index: startIdx + i + 1,
                        source: domain,
                        excerpt: url,
                        url,
                      };
                    });

                    // Collect domains for the "sources" SSE event
                    searchSourceDomains = pplxCitationUrls.map((url: string) => {
                      try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
                    });
                  }

                  emitStep(controller, encoder, { name: `${stepLabel} — ${pplxCitationUrls.length} sources`, status: "done" });

                  // Emit sources event for favicon pills in StepTracker
                  if (searchSourceDomains.length > 0) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({
                        type: "sources",
                        urls: pplxCitationUrls,
                        domains: [...new Set(searchSourceDomains)],
                      })}\n\n`)
                    );
                  }
                } else {
                  const errText = await pplxResp.text();
                  console.error("Perplexity error:", pplxResp.status, errText);
                  emitStep(controller, encoder, { name: "Research unavailable — continuing", status: "done" });
                }
              } catch (pplxErr) {
                console.error("Perplexity call failed:", pplxErr);
                emitStep(controller, encoder, { name: "Research failed — continuing", status: "done" });
              }
            } else {
              emitStep(controller, encoder, { name: "No search configured — skipping", status: "done" });
            }
          }

          // Build system prompt with personalized context
          const effectiveMode = promptMode || useCase;
          let customPrompt = "";
          if (effectiveMode && agentConf.prompts?.[effectiveMode]) {
            customPrompt = agentConf.prompts[effectiveMode];
          } else if (effectiveMode === "review") {
            // Built-in review mode prompt
            customPrompt = "";
          } else {
            customPrompt = agentConf.prompts?.chat || "";
          }

          const personalizationContext = `\n\n## User & Organization Context\n- Organization: ${orgData?.name || "Unknown"}\n- User: ${profile.full_name || profile.email || "Unknown"}\n- Email: ${profile.email || "Unknown"}\n`;

          const reviewModePrompt = effectiveMode === "review" ? `
You are LawKit AI, an expert legal data extraction assistant. When the user asks you to create a review table or extract structured data:

1. Analyze the user's request to understand what columns they want
2. Extract data from the provided documents/sources
3. Output the result using this EXACT format:

<!-- SHEET: [Title of the review table] -->
\`\`\`json
{
  "columns": [
    {"name": "Column Name", "type": "free_response", "query": "What this column extracts"},
    {"name": "Date", "type": "date", "query": "Extract the relevant date"}
  ],
  "rows": [
    {"fileName": "document1.pdf", "fileId": "optional-id", "status": "completed", "values": {"Column Name": "extracted value", "Date": "2024-01-15"}},
    {"fileName": "document2.pdf", "status": "completed", "values": {"Column Name": "value", "Date": "2024-03-20"}}
  ]
}
\`\`\`

Column types: "free_response", "date", "classification", "verbatim", "number"

ALWAYS use this exact format so the frontend can render the interactive spreadsheet. Include a brief intro message before the sheet block explaining what you extracted.
` : "";

          const basePrompt = customPrompt || `You are LawKit AI, an expert legal research and drafting assistant. You provide accurate, well-reasoned legal analysis with proper citations.
// ... keep existing code
- At the end of your response, suggest 3 follow-up questions the user might want to ask, each on its own line starting with ">>FOLLOWUP: "`;

          const systemPrompt = `${reviewModePrompt || basePrompt}
${personalizationContext}
${knowledgeContext}
${ragContext || vaultContext}
${perplexityContext}`;

          // Determine AI provider
          let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
          let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
          let modelId = "google/gemini-2.5-flash";
          let headers: Record<string, string> = {
            Authorization: `Bearer ${aiKey}`,
            "Content-Type": "application/json",
          };

          const { data: llmConfigs } = await adminClient
            .from("llm_configs")
            .select("*")
            .or(`organization_id.eq.${orgId},organization_id.is.null`)
            .eq("is_active", true)
            .eq("use_case", "chat")
            .order("is_default", { ascending: false })
            .limit(1);

          if (llmConfigs?.[0]) {
            const cfg = llmConfigs[0];
            let configuredModel = cfg.model_id;
            
            if (configuredModel && !configuredModel.includes("/")) {
              if (configuredModel.startsWith("gemini")) {
                configuredModel = `google/${configuredModel}`;
              } else if (configuredModel.startsWith("gpt")) {
                configuredModel = `openai/${configuredModel}`;
              }
            }
            
            modelId = configuredModel || modelId;
          }

          // Build messages array with server-side history
          const aiMessages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: message },
          ];

          // Save user message
          if (conversationId) {
            await adminClient.from("messages").insert({
              conversation_id: conversationId,
              organization_id: orgId,
              role: "user",
              content: message,
            });
          }

          // ---- STEP: Synthesizing ----
          emitStep(controller, encoder, { name: "Synthesizing response", status: "working" });

          const aiResponse = await fetch(aiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: modelId,
              messages: aiMessages,
              stream: true,
              max_tokens: deepResearch ? 8192 : 4096,
              temperature: 0.3,
            }),
          });

          if (!aiResponse.ok) {
            const status = aiResponse.status;
            const errText = await aiResponse.text();
            console.error("AI gateway error:", status, errText);
            
            let errorMsg = "AI service temporarily unavailable. Please try again.";
            if (status === 429) errorMsg = "Rate limit exceeded. Please try again in a moment.";
            if (status === 402) errorMsg = "Usage limit reached. Please add credits to continue.";
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`)
            );
            controller.close();
            return;
          }

          emitStep(controller, encoder, { name: "Synthesizing response", status: "done" });

          const reader = aiResponse.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let reasoningContent = "";
          let buffer = "";
          let inThinkBlock = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  // Detect <think> blocks for reasoning
                  let remaining = content;
                  while (remaining.length > 0) {
                    if (inThinkBlock) {
                      const closeIdx = remaining.indexOf("</think>");
                      if (closeIdx !== -1) {
                        reasoningContent += remaining.slice(0, closeIdx);
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: "reasoning", content: remaining.slice(0, closeIdx) })}\n\n`)
                        );
                        remaining = remaining.slice(closeIdx + 8);
                        inThinkBlock = false;
                      } else {
                        reasoningContent += remaining;
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: "reasoning", content: remaining })}\n\n`)
                        );
                        remaining = "";
                      }
                    } else {
                      const openIdx = remaining.indexOf("<think>");
                      if (openIdx !== -1) {
                        const before = remaining.slice(0, openIdx);
                        if (before) {
                          fullContent += before;
                          controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ type: "token", content: before })}\n\n`)
                          );
                        }
                        remaining = remaining.slice(openIdx + 7);
                        inThinkBlock = true;
                      } else {
                        fullContent += remaining;
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: "token", content: remaining })}\n\n`)
                        );
                        remaining = "";
                      }
                    }
                  }
                }
              } catch {
                // Partial JSON, skip
              }
            }
          }

          // Extract follow-up questions from content
          const followUps: string[] = [];
          const followUpLines = fullContent.split("\n").filter(line => line.startsWith(">>FOLLOWUP: "));
          followUpLines.forEach(line => {
            const q = line.replace(">>FOLLOWUP: ", "").trim();
            if (q) followUps.push(q);
          });

          // Strip follow-up lines from content for storage
          const cleanedContent = fullContent.split("\n").filter(line => !line.startsWith(">>FOLLOWUP: ")).join("\n").trim();

          // Merge citations — also match superscript numbers
          const vaultCitations = extractCitations(cleanedContent, ragContext || vaultContext);
          const allCitations = [...vaultCitations, ...ragCitations, ...perplexityCitations];

          // Deduplicate citations by index
          const uniqueCitations = Array.from(
            new Map(allCitations.map(c => [c.index, c])).values()
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", citations: uniqueCitations, model: modelId, followUps })}\n\n`
            )
          );

          // Save assistant message
          if (conversationId) {
            await adminClient.from("messages").insert({
              conversation_id: conversationId,
              organization_id: orgId,
              role: "assistant",
              content: cleanedContent,
              model_used: modelId,
              citations: uniqueCitations.length > 0 ? uniqueCitations : null,
            });

            const { count } = await adminClient
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("conversation_id", conversationId);

            if (count && count <= 2) {
              const title = cleanedContent.substring(0, 60).replace(/[#*\n]/g, '').trim() + (cleanedContent.length > 60 ? "..." : "");
              await adminClient
                .from("conversations")
                .update({ title })
                .eq("id", conversationId);
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: "Stream interrupted" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    console.error("llm-router error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Superscript digit mapping
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "\u2070": "0", "\u00b9": "1", "\u00b2": "2", "\u00b3": "3", "\u2074": "4",
  "\u2075": "5", "\u2076": "6", "\u2077": "7", "\u2078": "8", "\u2079": "9",
};

function extractCitations(content: string, vaultContext: string): { index: number; source: string; excerpt: string }[] {
  const citations: { index: number; source: string; excerpt: string }[] = [];
  const seen = new Set<number>();

  // Match [N] format
  const bracketMatches = content.matchAll(/\[(\d+)\]/g);
  for (const match of bracketMatches) {
    const idx = parseInt(match[1]);
    if (seen.has(idx)) continue;
    seen.add(idx);
    const docMatch = vaultContext.match(new RegExp(`### \\[${idx}\\] (.+?)\\n([\\s\\S]*?)(?=### \\[|$)`));
    citations.push({
      index: idx,
      source: docMatch?.[1] || `Source ${idx}`,
      excerpt: docMatch?.[2]?.substring(0, 200)?.trim() || "",
    });
  }

  // Match superscript numbers
  const superscriptPattern = /[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+/g;
  const superMatches = content.matchAll(superscriptPattern);
  for (const match of superMatches) {
    const digits = match[0].split("").map(c => SUPERSCRIPT_DIGITS[c] || c).join("");
    const idx = parseInt(digits);
    if (isNaN(idx) || seen.has(idx)) continue;
    seen.add(idx);
    const docMatch = vaultContext.match(new RegExp(`### \\[${idx}\\] (.+?)\\n([\\s\\S]*?)(?=### \\[|$)`));
    citations.push({
      index: idx,
      source: docMatch?.[1] || `Source ${idx}`,
      excerpt: docMatch?.[2]?.substring(0, 200)?.trim() || "",
    });
  }

  return citations;
}

// --- OpenAI Embedding for query ---
async function embedQuery(text: string, apiKey: string, model: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI embedding error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}
