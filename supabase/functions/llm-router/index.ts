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
  currentSheetState?: any;
  workflowSystemPrompt?: string;
  currentDocumentContent?: string;
  // Column fill specific
  columnMeta?: { name: string; type: string; query: string };
  fileNames?: string[];
  existingSheet?: any;
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

function emitStep(controller: ReadableStreamDefaultController, encoder: TextEncoder, step: { name: string; status: string; detail?: string; duration?: string }) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "step", step })}\n\n`)
  );
}

function emitPlan(controller: ReadableStreamDefaultController, encoder: TextEncoder, steps: string[]) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "plan", steps })}\n\n`)
  );
}

function emitThinking(controller: ReadableStreamDefaultController, encoder: TextEncoder, content: string) {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify({ type: "thinking", content })}\n\n`)
  );
}

// Generate a plan based on what the query needs
function generatePlan(message: string, hasVault: boolean, hasSearch: boolean, deepResearch: boolean, effectiveMode?: string): string[] {
  const plan: string[] = [];
  
  plan.push("Analyze query and identify intent");
  
  if (hasVault) {
    plan.push("Search and analyze uploaded documents");
  }
  
  if (hasSearch || deepResearch) {
    plan.push(deepResearch ? "Deep research across 25+ legal sources" : "Research relevant legal sources");
  }
  
  if (effectiveMode === "review") {
    plan.push("Extract structured data into review table");
  } else if (effectiveMode === "red_flags") {
    plan.push("Analyze for risks and red flags");
  } else if (effectiveMode === "drafting") {
    plan.push("Draft legal document");
  }
  
  plan.push("Synthesize comprehensive response");
  
  return plan;
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
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, attachedFileNames, sources, history, useCase, vaultName: clientVaultName, promptMode, currentSheetState, columnMeta, fileNames, existingSheet, workflowSystemPrompt, currentDocumentContent } = body;

    // ---------- COLUMN FILL USE CASE (non-streaming) ----------
    if (useCase === "column_fill" && columnMeta) {
      let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
      let modelId = "google/gemini-2.5-flash";

      const { data: llmConfigs } = await adminClient
        .from("llm_configs")
        .select("*")
        .or(`organization_id.eq.${orgId},organization_id.is.null`)
        .eq("is_active", true)
        .eq("use_case", "extraction")
        .order("is_default", { ascending: false })
        .limit(1);

      if (llmConfigs?.[0]) {
        let configuredModel = llmConfigs[0].model_id;
        if (configuredModel && !configuredModel.includes("/")) {
          if (configuredModel.startsWith("gemini")) configuredModel = `google/${configuredModel}`;
          else if (configuredModel.startsWith("gpt")) configuredModel = `openai/${configuredModel}`;
        }
        modelId = configuredModel || modelId;
      }

      const fileNamesList = fileNames || existingSheet?.rows?.map((r: any) => r.fileName) || [];
      
      // Load actual file content for each file so AI has real data to extract from
      let fileContentContext = "";
      if (fileNamesList.length > 0) {
        const { data: fileRecords } = await adminClient
          .from("files")
          .select("name, extracted_text")
          .eq("organization_id", orgId)
          .in("name", fileNamesList)
          .not("extracted_text", "is", null)
          .limit(50);
        
        if (fileRecords?.length) {
          fileContentContext = "\n\n## Document Contents\n" +
            fileRecords.map((f: any) => 
              `### ${f.name}\n${(f.extracted_text || "").substring(0, 4000)}`
            ).join("\n\n");
        }
      }
      
      const colFillPrompt = `You are a data extraction AI. Given a column definition, extract the value for each file/document using the actual document contents provided below.

Column Name: ${columnMeta.name}
Column Type: ${columnMeta.type}
Extraction Query: ${columnMeta.query}

Files to extract from:
${fileNamesList.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n")}
${fileContentContext}

Respond with ONLY a JSON object mapping file names to extracted values:
{
  "filename1.pdf": "extracted value 1",
  "filename2.pdf": "extracted value 2"
}

If you cannot determine a value from the document content, use "N/A". Be concise but accurate. Extract ONLY from the document text provided above.`;

      try {
        const resp = await fetch(aiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: "You extract structured data from document names and context. Respond only with valid JSON." },
              { role: "user", content: colFillPrompt },
            ],
            max_tokens: 2048,
            temperature: 0.1,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || "{}";
          // Extract JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          const values = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
          
          return new Response(JSON.stringify({ values }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify({ error: "AI extraction failed", values: {} }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        console.error("Column fill error:", err);
        return new Response(JSON.stringify({ error: "Column fill failed", values: {} }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

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

    // ---- SERVER-SIDE CONVERSATION HISTORY ----
    let conversationHistory: { role: string; content: string }[] = [];
    if (conversationId && conversationId !== "column-fill") {
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
    if (conversationHistory.length === 0 && history?.length) {
      conversationHistory = history;
    }

    // Extract existing sheet state from conversation history or client
    let existingSheetJson = "";
    if (currentSheetState) {
      existingSheetJson = JSON.stringify(currentSheetState);
    } else {
      // Search conversation history for SHEET blocks
      for (const msg of conversationHistory) {
        const sheetMatch = msg.content.match(/<!--\s*SHEET:\s*(.+?)\s*-->\s*```json\s*([\s\S]*?)```/);
        if (sheetMatch) {
          existingSheetJson = sheetMatch[2];
        }
      }
    }

    const encoder = new TextEncoder();
    const effectiveMode = promptMode || useCase;
    const needsSearch = (sources && sources.length > 0) || deepResearch;
    const hasVault = !!(vaultId || attachedFileIds?.length);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Accumulators for metadata persistence
          let accumulatedThinkingText = "";
          const stepStartTimes: Map<string, number> = new Map();

          const encoder = new TextEncoder();
          const trackStep = (name: string, status: string, detail?: string) => {
            if (status === "working") {
              stepStartTimes.set(name, Date.now());
            }
            let duration: string | undefined;
            if (status === "done") {
              const start = stepStartTimes.get(name);
              if (start) {
                duration = `${Math.round((Date.now() - start) / 1000)}s`;
              }
            }
            emitStep(controller, encoder, { name, status, detail, duration });
          };

          // Wrapper to also accumulate thinking text for metadata
          const emitThinkingAndAccumulate = (content: string) => {
            accumulatedThinkingText += (accumulatedThinkingText ? "\n" : "") + content;
            emitThinking(controller, encoder, content);
          };

          // ---- EMIT PLAN FIRST ----
          const planSteps = generatePlan(message, hasVault, !!needsSearch, !!deepResearch, effectiveMode);
          emitPlan(controller, encoder, planSteps);

          // ---- STEP 1: Analyze query ----
          trackStep("Analyzing your query", "working");

          // Load knowledge base
          const { data: knowledgeEntries } = await adminClient
            .from("knowledge_entries")
            .select("title, content, category")
            .or(`organization_id.eq.${orgId},is_global.eq.true`);

          let knowledgeContext = "";
          if (knowledgeEntries?.length) {
            knowledgeContext = "\n\n## Knowledge Base\n" +
              knowledgeEntries.map((e: any) => `### ${e.title} (${e.category || "general"})\n${e.content}`).join("\n\n");
            trackStep("Analyzing your query", "done", `Loaded ${knowledgeEntries.length} knowledge entries`);
          } else {
            trackStep("Analyzing your query", "done");
          }

          // --- RAG: Qdrant vector search ---
          let ragContext = "";
          let ragCitations: { index: number; source: string; excerpt: string }[] = [];

          if (hasVault && qdrantConf.url && qdrantConf.api_key && openaiConf.api_key) {
            trackStep("Searching your documents", "working");
            emitThinkingAndAccumulate("Embedding query and searching document vectors for relevant passages...");

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
                  
                  // Emit file refs
                  const { data: fileDetails } = await adminClient
                    .from("files")
                    .select("id, name")
                    .eq("vault_id", vaultId)
                    .eq("organization_id", orgId)
                    .limit(10);
                  
                  if (fileDetails?.length) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: "file_refs", files: fileDetails.map((f: any) => ({ name: f.name, id: f.id })) })}\n\n`)
                    );
                  }
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
                  emitThinkingAndAccumulate(`Found ${results.length} relevant document sections. Analyzing content for the most relevant information.`);
                  trackStep("Searching your documents", "done", `Found ${results.length} relevant sections`);
                } else {
                  trackStep("Searching your documents", "done", "No matching sections found");
                }
              } else {
                const errText = await searchResp.text();
                console.error("Qdrant search failed:", searchResp.status, errText);
                trackStep("Reading documents directly", "done");
              }
            } catch (ragErr: any) {
              console.error("RAG error:", ragErr.message);
              trackStep("Reading documents directly", "done");
            }
          }

          // Load vault name and file inventory for context
          let vaultName = "";
          let vaultInventory = "";
          if (vaultId) {
            const { data: vaultData } = await adminClient.from("vaults").select("name").eq("id", vaultId).single();
            vaultName = vaultData?.name || "";
            
            // Always load file listing so AI knows what's available
            const { data: vaultFiles } = await adminClient
              .from("files")
              .select("name, status, size_bytes, mime_type")
              .eq("vault_id", vaultId)
              .eq("organization_id", orgId)
              .order("created_at", { ascending: false })
              .limit(50);
            
            if (vaultFiles?.length) {
              vaultInventory = `\n\n## Available Documents in Vault "${vaultName}"\n` +
                vaultFiles.map((f: any) => `- ${f.name} (${f.status}, ${Math.round(f.size_bytes / 1024)}KB)`).join("\n");
            }
          }

          // Fallback: direct file text
          let vaultContext = "";
          if (!ragContext && hasVault) {
            trackStep("Reading vault documents", "working");
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
              emitThinkingAndAccumulate(`Loaded ${files.length} documents directly. Reading through content to find relevant information.`);
              trackStep("Reading vault documents", "done", `Analyzed ${files.length} documents`);
            } else {
              trackStep("Reading vault documents", "done", "No documents found");
            }
          }

          // ---- PERPLEXITY SEARCH ----
          let perplexityContext = "";
          let perplexityCitations: { index: number; source: string; excerpt: string; url?: string }[] = [];
          let searchSourceDomains: string[] = [];

          if (needsSearch) {
            const pplxModel = selectPerplexityModel(message, !!deepResearch, useCase);
            const stepLabel = deepResearch
              ? "Deep analysis across 25+ sources"
              : "Researching relevant sources";
            trackStep(stepLabel, "working");
            emitThinkingAndAccumulate("Searching across legal databases and research sources...");

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
                const perplexityKey = await decryptApiKey(perplexityConfig.api_key_encrypted, perplexityConfig.api_key_iv || "");

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

                    searchSourceDomains = pplxCitationUrls.map((url: string) => {
                      try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
                    });
                  }

                  emitThinkingAndAccumulate(`Found ${pplxCitationUrls.length} authoritative sources. Cross-referencing findings with document analysis.`);
                  trackStep(stepLabel, "done", `${pplxCitationUrls.length} sources analyzed`);

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
                  trackStep("Research unavailable — continuing", "done");
                }
              } catch (pplxErr) {
                console.error("Perplexity call failed:", pplxErr);
                trackStep("Research failed — continuing", "done");
              }
            } else {
              trackStep("No search configured — skipping", "done");
            }
          }

          // Build system prompt
          let customPrompt = "";
          if (effectiveMode && agentConf.prompts?.[effectiveMode]) {
            customPrompt = agentConf.prompts[effectiveMode];
          } else if (effectiveMode === "review") {
            customPrompt = "";
          } else if (effectiveMode === "drafting") {
            customPrompt = "";
          } else {
            customPrompt = agentConf.prompts?.chat || "";
          }

          const personalizationContext = `\n\n## User & Organization Context\n- Organization: ${orgData?.name || "Unknown"}\n- User: ${profile.full_name || profile.email || "Unknown"}\n- Email: ${profile.email || "Unknown"}\n`;

          const draftingModePrompt = effectiveMode === "drafting" ? `
You are LawKit AI, an expert legal document drafting assistant.

CRITICAL RULES:
- You MUST generate a complete, properly formatted legal document. NEVER output JSON, extraction data, or structured data objects.
- Start with "# [Document Title]" followed by the full document body.
- Use proper legal document formatting: numbered sections, subsections, defined terms in bold, signature blocks.
- Fill in ALL details using the user's provided information and the organization context. NEVER use placeholder text like [Party Name], [Date], etc.
- If a detail is not provided, use reasonable professional defaults or omit the clause with a note.
- Include all standard clauses expected for the document type (e.g., for NDA: definitions, obligations, exclusions, term, remedies, governing law, signatures).
- Use the organization name and user details from the context to personalize the document.
- At the end, suggest 3 follow-up questions starting with ">>FOLLOWUP: "
` : "";

          const reviewModePrompt = effectiveMode === "review" ? `
You are LawKit AI, an expert legal data extraction assistant.

CRITICAL: You MUST output your result using the EXACT format below. Do NOT use markdown tables. Do NOT output plain text tables. You MUST use the <!-- SHEET: --> format.

${existingSheetJson ? `## CURRENT SHEET STATE (Modify this — do NOT create a new table)
The user already has an existing table. When they ask to add/remove/modify columns or rows, output the FULL updated table with ALL existing data preserved plus the requested changes.

Current table data:
\`\`\`json
${existingSheetJson}
\`\`\`

IMPORTANT: Preserve all existing columns and their data. Only modify what the user asked for. Output the complete updated table.
` : ""}

## Output Format (MANDATORY)

First write a brief 1-2 sentence intro, then output EXACTLY this structure:

<!-- SHEET: Contract Obligations Summary -->
\`\`\`json
{
  "columns": [
    {"name": "Document", "type": "free_response", "query": "Name of the source document"},
    {"name": "Key Date", "type": "date", "query": "Extract the most important date"},
    {"name": "Amount", "type": "number", "query": "Extract the monetary amount"}
  ],
  "rows": [
    {"fileName": "agreement.pdf", "status": "completed", "values": {"Document": "Service Agreement", "Key Date": "2024-01-15", "Amount": "$50,000"}},
    {"fileName": "addendum.pdf", "status": "completed", "values": {"Document": "Addendum A", "Key Date": "2024-06-01", "Amount": "$10,000"}}
  ]
}
\`\`\`

## Rules
- Column types: "free_response", "date", "classification", "verbatim", "number"
- Every row MUST have a "values" object with keys matching EXACTLY the column names
- If modifying an existing table, output the FULL updated table — preserve all existing data
- NEVER use markdown table syntax (|---|). ALWAYS use <!-- SHEET: --> JSON format
- Include 3-5 meaningful columns based on the user's request
- If the user doesn't specify columns, infer appropriate ones from the document content
- When adding new columns to an existing table, you MUST fill in the values for ALL rows using the document context provided. Extract the actual data from the document chunks/text — do NOT leave values empty or as "N/A" if the information exists in the provided documents.
- Each row's "values" must include ALL column keys (both existing and new columns)

IMPORTANT: Output ONLY the <!-- SHEET: --> format. NEVER use markdown tables. This is mandatory.
` : "";

          const basePrompt = customPrompt || `You are LawKit AI, an expert legal research and drafting assistant. You provide accurate, well-reasoned legal analysis with proper citations.

## Response Quality Rules
- Always analyze the FULL content of ALL provided documents before responding
- When asked about totals/sums, compute actual numbers with per-document breakdowns
- Structure responses with clear sections, headers, and bullet points
- Use markdown tables for comparative data
- Be analytical and thorough — reason through complex questions step by step
- For complex queries, use <think>...</think> tags to reason before answering

## Document Generation Rules
- You CAN generate documents in ANY mode (chat, research, red flag)
- When the user's query implies document creation (draft, write, create, prepare, generate), produce the full document
- Start documents with "# Document Title" heading followed by the full document content
- Use actual organization data from the context — NEVER use placeholders like [Firm Name], [Your Name], etc.

## Generative UI Rules
- Only use numbered bold choices when you genuinely need user input between 2-4 distinct approaches
- NEVER use choice formatting for: data listings, analysis results, document summaries, financial breakdowns
- When you have sufficient context, proceed with analysis directly — don't ask unnecessary clarifying questions

## Citation Rules
- Use [1], [2], [3] notation — sequential integers only
- NEVER use [Web] or any non-numeric citation markers
- Cite every factual claim with its source number
- If you reference uploaded documents, cite them with their document number [1], [2], etc.
- If you reference research results, cite them with their source number

## Formatting Rules
- Format responses with markdown: headers, lists, bold for key terms
- When creating tables, use proper markdown table syntax with | separators
- Always structure your analysis clearly with sections
- NEVER use placeholder text like [Firm Name], [Contact Person], etc.
- Do not include "---" horizontal rules or "References:" sections at the end
- At the end of your response, suggest 3 follow-up questions the user might want to ask, each on its own line starting with ">>FOLLOWUP: "`;

          // Document editing context — also enforce version updates in drafting mode
          let documentEditingContext = "";
          if (currentDocumentContent) {
            documentEditingContext = `\n\n## Currently Open Document (VERSION UPDATE MODE)
The user has an existing document open in the editor. You MUST:
1. UPDATE the existing document with the requested changes — do NOT create a brand new document
2. Output the COMPLETE updated document with "# [Same Title]" heading
3. Preserve all existing content that the user did not ask to change
4. Apply modifications inline where needed
5. NEVER generate a separate/new document card — always output ONE updated document

Current document content:
${currentDocumentContent.substring(0, 10000)}`;
          }

          // Workflow system prompt override
          let effectiveBasePrompt = draftingModePrompt || reviewModePrompt || basePrompt;
          if (workflowSystemPrompt) {
            effectiveBasePrompt = workflowSystemPrompt + "\n\n" + effectiveBasePrompt;
          }

          const systemPrompt = `${effectiveBasePrompt}
${personalizationContext}
${knowledgeContext}
${vaultInventory}
${ragContext || vaultContext}
${perplexityContext}
${documentEditingContext}`;

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
          const aiMessages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
            { role: "user", content: message },
          ];

          // Save user message
          if (conversationId && conversationId !== "column-fill") {
            await adminClient.from("messages").insert({
              conversation_id: conversationId,
              organization_id: orgId,
              role: "user",
              content: message,
            });
          }

          // ---- STEP: Synthesizing ----
          trackStep("Synthesizing response", "working");

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

          trackStep("Synthesizing response", "done");

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

          // Extract follow-up questions
          const followUps: string[] = [];
          const followUpLines = fullContent.split("\n").filter(line => line.startsWith(">>FOLLOWUP: "));
          followUpLines.forEach(line => {
            const q = line.replace(">>FOLLOWUP: ", "").trim();
            if (q) followUps.push(q);
          });

          const cleanedContent = fullContent.split("\n").filter(line => !line.startsWith(">>FOLLOWUP: ")).join("\n").trim();

          // Merge citations
          const vaultCitations = extractCitations(cleanedContent, ragContext || vaultContext);
          const allCitations = [...vaultCitations, ...ragCitations, ...perplexityCitations];

          const uniqueCitations = Array.from(
            new Map(allCitations.map(c => [c.index, c])).values()
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", citations: uniqueCitations, model: modelId, followUps })}\n\n`
            )
          );

          // Collect all tracked steps for metadata persistence
          const collectedSteps: any[] = [];
          // We track steps via emitStep — collect from stepStartTimes
          for (const [name] of stepStartTimes) {
            const start = stepStartTimes.get(name);
            const duration = start ? `${Math.round((Date.now() - start) / 1000)}s` : undefined;
            collectedSteps.push({ name, status: "done", duration });
          }

          const messageMetadata: any = {};
          if (collectedSteps.length > 0) messageMetadata.frozenSteps = collectedSteps;
          if (planSteps.length > 0) messageMetadata.frozenPlan = planSteps;
          if (accumulatedThinkingText) messageMetadata.frozenThinkingText = accumulatedThinkingText;
          if (reasoningContent) messageMetadata.frozenReasoning = reasoningContent;
          if (followUps.length > 0) messageMetadata.followUps = followUps;
          if (searchSourceDomains.length > 0) {
            messageMetadata.frozenSearchSources = {
              urls: perplexityCitations.map(c => c.url).filter(Boolean),
              domains: [...new Set(searchSourceDomains)],
            };
          }

          // Save assistant message
          if (conversationId && conversationId !== "column-fill") {
            await adminClient.from("messages").insert({
              conversation_id: conversationId,
              organization_id: orgId,
              role: "assistant",
              content: cleanedContent,
              model_used: modelId,
              citations: uniqueCitations.length > 0 ? uniqueCitations : null,
              metadata: Object.keys(messageMetadata).length > 0 ? messageMetadata : null,
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
