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

    // Verify user with getUser
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

    // Get user profile for org_id
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
    const { conversationId, message, vaultId, deepResearch, attachedFileIds, sources, history } = body;

    // Build agentic steps for SSE
    const steps: { name: string; status: "done" | "working" }[] = [];

    // Collect context from knowledge base
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

    // Collect vault file context if vault is selected
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
        // Update step
        steps[steps.length - 1] = { name: `Searched ${files.length} documents in vault`, status: "done" };
      } else {
        steps[steps.length - 1] = { name: "No matching documents found", status: "done" };
      }
    }

    // Check for file chunks (RAG)
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

    // Build system prompt
    const systemPrompt = `You are LawKit AI, an expert legal research and drafting assistant. You provide accurate, well-reasoned legal analysis with proper citations.

## Guidelines
- Be thorough but concise
- Cite sources using [1], [2] notation when referencing documents
- When drafting, use professional legal language
- Always note jurisdictional considerations
- If you reference uploaded documents, cite them with their document number
- Format responses with markdown: headers, lists, bold for key terms
- When creating tables, use proper markdown table syntax
- Always structure your analysis clearly with sections
${knowledgeContext}
${vaultContext}
${chunkContext}`;

    // Determine which AI provider to use
    const { data: llmConfigs } = await adminClient
      .from("llm_configs")
      .select("*")
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .eq("is_active", true)
      .eq("use_case", "chat")
      .order("is_default", { ascending: false })
      .limit(1);

    // Default: use Lovable AI Gateway
    let aiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let aiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    let modelId = "google/gemini-3-flash-preview";
    let headers: Record<string, string> = {
      Authorization: `Bearer ${aiKey}`,
      "Content-Type": "application/json",
    };

    if (llmConfigs?.[0]) {
      const config = llmConfigs[0];
      if (config.model_id) modelId = config.model_id;
    }

    if (deepResearch) {
      steps.push({ name: "Conducting deep research analysis", status: "working" });
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
          // Send agentic steps
          const allSteps = [
            ...steps,
            { name: "Generating response", status: "working" as const },
          ];
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "steps", steps: allSteps })}\n\n`)
          );

          // Call AI
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

          // Stream the AI response
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

          // Send completion with citations
          const citations = extractCitations(fullContent, vaultContext);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", citations, model: modelId })}\n\n`
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
              citations: citations.length > 0 ? citations : null,
            });

            // Update conversation title if first message
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
