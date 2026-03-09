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
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, attachedFileNames, sources, history, useCase, vaultName: clientVaultName } = body;

    // Load org info for personalization
    const { data: orgData } = await adminClient
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const steps: { name: string; status: "done" | "working" }[] = [];

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

    // Load knowledge base
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

    // --- RAG: Qdrant vector search ---
    let ragContext = "";
    let ragCitations: { index: number; source: string; excerpt: string }[] = [];

    if ((vaultId || attachedFileIds?.length) && qdrantConf.url && qdrantConf.api_key && openaiConf.api_key) {
      steps.push({ name: "Searching documents (vector)", status: "working" });

      try {
        const queryEmbedding = await embedQuery(message, openaiConf.api_key, embeddingModel);
        const collectionName = `${qdrantConf.collection_prefix || "org_"}${orgId}`;

        const mustFilters: any[] = [{ key: "org_id", match: { value: orgId } }];
        if (vaultId) {
          const { data: vaultFiles } = await adminClient
            .from("files")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("organization_id", orgId);

          if (vaultFiles?.length) {
            mustFilters.push({
              key: "file_id",
              match: { any: vaultFiles.map(f => f.id) },
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
            steps[steps.length - 1] = { name: `Found ${results.length} relevant chunks`, status: "done" };
          } else {
            steps[steps.length - 1] = { name: "No matching chunks found", status: "done" };
          }
        } else {
          console.error("Qdrant search failed:", await searchResp.text());
          steps[steps.length - 1] = { name: "Vector search failed — using fallback", status: "done" };
        }
      } catch (ragErr: any) {
        console.error("RAG error:", ragErr.message);
        steps[steps.length - 1] = { name: "Vector search error — using fallback", status: "done" };
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
      steps.push({ name: "Searching vault documents", status: "working" });
      const fileQuery = adminClient.from("files").select("id, name, extracted_text, extracted_text_r2_key, status").eq("organization_id", orgId);
      if (vaultId) fileQuery.eq("vault_id", vaultId);
      if (attachedFileIds?.length) fileQuery.in("id", attachedFileIds);
      // Don't filter by status - include any file that has extracted text
      const { data: files } = await fileQuery.not("extracted_text", "is", null).limit(10);

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

    // ---- PERPLEXITY SEARCH ----
    let perplexityContext = "";
    let perplexityCitations: { index: number; source: string; excerpt: string; url?: string }[] = [];
    const needsSearch = (sources && sources.length > 0) || deepResearch;

    if (needsSearch) {
      const pplxModel = selectPerplexityModel(message, !!deepResearch, useCase);
      const pplxConfig = MODEL_CONFIG[pplxModel] || MODEL_CONFIG.sonar;
      const searchType = deepResearch ? "deep research" : pplxModel === "sonar-reasoning" ? "risk analysis" : pplxModel === "sonar-pro" ? "detailed search" : "web search";
      steps.push({ name: `Running ${searchType} (${pplxModel})`, status: "working" });

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

    // Build system prompt with personalized context
    const promptMode = (body as any).promptMode;
    let customPrompt = "";
    if (promptMode && agentConf.prompts?.[promptMode]) {
      customPrompt = agentConf.prompts[promptMode];
    } else {
      customPrompt = agentConf.prompts?.chat || "";
    }

    const personalizationContext = `\n\n## User & Organization Context\n- Organization: ${orgData?.name || "Unknown"}\n- User: ${profile.full_name || profile.email || "Unknown"}\n- Email: ${profile.email || "Unknown"}\n`;

    const basePrompt = customPrompt || `You are LawKit AI, an expert legal research and drafting assistant. You provide accurate, well-reasoned legal analysis with proper citations.

## Guidelines
- Be thorough but concise
- Cite sources using [1], [2] notation when referencing documents
- When drafting documents, start with a clear "# Document Title" heading followed by the full document content
- When you need user clarification between multiple options, format as a numbered list with **bold option titles** and brief descriptions: "1. **Option Title** — Description of what this does"
- When drafting, use professional legal language
- Always note jurisdictional considerations
- If you reference uploaded documents, cite them with their document number
- If you reference web research results, cite them with their source URLs
- Format responses with markdown: headers, lists, bold for key terms
- When creating tables, use proper markdown table syntax
- Always structure your analysis clearly with sections
- NEVER use placeholder text like [Firm Name], [Contact Person], [Email Address], [Phone Number], [Your Name], [Date]. Instead, use the actual data from the user's organization and profile when available, or write realistic generic content.
- Do not include "---" horizontal rules or "References:" sections at the end of drafted documents
- At the end of your response, suggest 3 follow-up questions the user might want to ask, each on its own line starting with ">>FOLLOWUP: "`;

    const systemPrompt = `${basePrompt}
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
