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
  sources?: string[];
  history?: { role: string; content: string }[];
  useCase?: string; // optional frontend hint: "red_flag" | "review" | "chat"
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

  // Explicit frontend hint takes priority
  if (useCase === "red_flag") return "sonar-reasoning";
  if (useCase === "review") return "sonar-pro";

  const lower = message.toLowerCase();
  // Red flag / risk analysis → reasoning model
  if (/red.?flag|risk.?analy|clause.?review|compliance.?check|due.?diligence|problematic|risky|liability/i.test(lower)) {
    return "sonar-reasoning";
  }
  // Review table / comparison / extraction → pro model (2x citations)
  if (/review.?table|compar|extract.?terms|obligation|provision|summar.*clause|side.?by.?side|benchmark/i.test(lower)) {
    return "sonar-pro";
  }
  // Default: fast sonar
  return "sonar";
}

// Map source names to Perplexity search domain filters
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
      console.error("Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
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
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, sources, history, useCase } = body;

    const steps: { name: string; status: "done" | "working" }[] = [];

    // Load agent config for custom system prompts
    const { data: agentConfig } = await adminClient
      .from("api_integrations")
      .select("config")
      .eq("organization_id", orgId)
      .eq("provider", "agent_config")
      .maybeSingle();

    const agentConf = (agentConfig?.config as any) || {};

    // Load knowledge base context
    const { data: knowledgeEntries } = await adminClient
      .from("knowledge_entries")
      .select("title, content, category")
      .or(`organization_id.eq.${orgId},is_global.eq.true`);

    let knowledgeContext = "";
    if (knowledgeEntries?.length) {
      knowledgeContext = "\n\n## Knowledge Base\n" +
        knowledgeEntries.map((e) => `### ${e.title} (${e.category || "general"})\n${e.content}`).join("\n\n");
      steps.push({ name: `Loaded ${knowledgeEntries.length} knowledge base entries`, status: "done" });
    }

    // Load vault file context
    let vaultContext = "";
    if (vaultId || attachedFileIds?.length) {
      steps.push({ name: "Searching vault documents", status: "working" });
      const fileQuery = adminClient.from("files").select("id, name, extracted_text").eq("organization_id", orgId);
      if (vaultId) fileQuery.eq("vault_id", vaultId);
      if (attachedFileIds?.length) fileQuery.in("id", attachedFileIds);
      const { data: files } = await fileQuery.eq("status", "ready").limit(10);

      if (files?.length) {
        vaultContext = "\n\n## Relevant Documents\n" +
          files
            .filter((f) => f.extracted_text)
            .map((f, i) => `### [${i + 1}] ${f.name}\n${f.extracted_text?.substring(0, 3000)}`)
            .join("\n\n");
        steps[steps.length - 1] = { name: `Searched ${files.length} documents in vault`, status: "done" };
      } else {
        steps[steps.length - 1] = { name: "No matching documents found", status: "done" };
      }
    }

    // Load file chunks (RAG)
    let chunkContext = "";
    if (vaultId) {
      const { data: chunks } = await adminClient
        .from("file_chunks")
        .select("content, file_id, chunk_index")
        .eq("organization_id", orgId)
        .limit(20);
      
      if (chunks?.length) {
        chunkContext = "\n\n## Document Chunks (RAG)\n" +
          chunks.map((c) => c.content).join("\n---\n");
      }
    }

    // ---- PERPLEXITY SEARCH ----
    let perplexityContext = "";
    let perplexityCitations: { index: number; source: string; excerpt: string; url?: string }[] = [];
    const needsSearch = (sources && sources.length > 0) || deepResearch;

    if (needsSearch) {
      const pplxModel = selectPerplexityModel(message, !!deepResearch, useCase);
      const pplxConfig = MODEL_CONFIG[pplxModel] || MODEL_CONFIG.sonar;
      const searchType = deepResearch ? "deep research" : pplxModel === "sonar-reasoning" ? "risk analysis" : pplxModel === "sonar-pro" ? "detailed search" : "web search";
      steps.push({ name: `Running ${searchType} (${pplxModel})`, status: "working" });

      // Get Perplexity API key from api_integrations
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

          // Build domain filter from sources
          const domainFilter: string[] = [];
          if (sources) {
            for (const s of sources) {
              const domains = SOURCE_DOMAIN_MAP[s];
              if (domains && domains.length > 0) {
                domainFilter.push(...domains);
              }
            }
          }

          // Build search query with jurisdiction context
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

            perplexityContext = `\n\n## Web Research Results (via Perplexity)\n${pplxContent}`;

            if (pplxCitationUrls.length > 0) {
              perplexityContext += "\n\n### Sources:\n" +
                pplxCitationUrls.map((url: string, i: number) => `[${i + 1}] ${url}`).join("\n");

              perplexityCitations = pplxCitationUrls.map((url: string, i: number) => ({
                index: i + 100,
                source: new URL(url).hostname.replace("www.", ""),
                excerpt: url,
                url,
              }));
            }

            steps[steps.length - 1] = {
              name: `${searchType} complete — ${pplxCitationUrls.length} sources found`,
              status: "done",
            };
          } else {
            const errText = await pplxResp.text();
            console.error("Perplexity error:", pplxResp.status, errText);
            steps[steps.length - 1] = { name: `${searchType} failed — continuing without`, status: "done" };
          }
        } catch (pplxErr) {
          console.error("Perplexity call failed:", pplxErr);
          steps[steps.length - 1] = { name: "Search failed — continuing without", status: "done" };
        }
      } else {
        steps[steps.length - 1] = { name: "No Perplexity API key configured — skipping search", status: "done" };
      }
    }

    // Build system prompt
    const customPrompt = agentConf.prompts?.chat || "";
    const basePrompt = customPrompt || `You are LawKit AI, an expert legal research and drafting assistant. You provide accurate, well-reasoned legal analysis with proper citations.

## Guidelines
- Be thorough but concise
- Cite sources using [1], [2] notation when referencing documents
- When drafting, use professional legal language
- Always note jurisdictional considerations
- If you reference uploaded documents, cite them with their document number
- If you reference web research results, cite them with their source URLs
- Format responses with markdown: headers, lists, bold for key terms
- When creating tables, use proper markdown table syntax
- Always structure your analysis clearly with sections`;

    const systemPrompt = `${basePrompt}
${knowledgeContext}
${vaultContext}
${chunkContext}
${perplexityContext}`;

    // Determine AI provider
    let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    let modelId = "google/gemini-3-flash-preview";
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

    if (llmConfigs?.[0]?.model_id) {
      modelId = llmConfigs[0].model_id;
    }

    // Build messages array
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m) => ({ role: m.role, content: m.content })),
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

    // Create SSE response
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const allSteps = [
            ...steps,
            { name: "Generating response", status: "working" as const },
          ];
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "steps", steps: allSteps })}\n\n`)
          );

          const aiResponse = await fetch(aiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: modelId,
              messages,
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

          const reader = aiResponse.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = "";
          let buffer = "";

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
                  fullContent += content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "token", content })}\n\n`)
                  );
                }
              } catch {
                // Partial JSON, skip
              }
            }
          }

          // Merge citations from vault docs + Perplexity
          const vaultCitations = extractCitations(fullContent, vaultContext);
          const allCitations = [...vaultCitations, ...perplexityCitations];

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", citations: allCitations, model: modelId })}\n\n`
            )
          );

          // Save assistant message
          if (conversationId) {
            await adminClient.from("messages").insert({
              conversation_id: conversationId,
              organization_id: orgId,
              role: "assistant",
              content: fullContent,
              model_used: modelId,
              citations: allCitations.length > 0 ? allCitations : null,
            });

            const { count } = await adminClient
              .from("messages")
              .select("*", { count: "exact", head: true })
              .eq("conversation_id", conversationId);

            if (count && count <= 2) {
              const title = fullContent.substring(0, 60).replace(/[#*\n]/g, '').trim() + (fullContent.length > 60 ? "..." : "");
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

function extractCitations(content: string, vaultContext: string): { index: number; source: string; excerpt: string }[] {
  const citations: { index: number; source: string; excerpt: string }[] = [];
  const matches = content.matchAll(/\[(\d+)\]/g);
  const seen = new Set<number>();

  for (const match of matches) {
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

  return citations;
}
