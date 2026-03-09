import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "fileId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[document-processor] Starting processing for file: ${fileId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch file record
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .single();

    if (fileError || !file) {
      console.error(`[document-processor] File not found: ${fileId}`, fileError);
      return new Response(
        JSON.stringify({ error: "File not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[document-processor] File found: ${file.original_name} (${file.mime_type}, ${file.size_bytes} bytes)`);

    // Update status to processing
    await supabase
      .from("files")
      .update({ status: "processing" })
      .eq("id", fileId);

    // Load agent config for OCR, embedding, Qdrant settings
    const { data: agentConfig } = await supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", file.organization_id)
      .eq("provider", "agent_config")
      .maybeSingle();

    const conf = (agentConfig?.config as any) || {};
    const ocrConf = conf.ocr || {};
    const qdrantConf = conf.qdrant || {};
    const openaiConf = conf.openai || {};
    const docConf = conf.document_analysis || {};
    const chunkSize = docConf.chunk_size || 1000;
    const chunkOverlap = docConf.chunk_overlap || 200;
    const embeddingModel = docConf.embedding_model || "text-embedding-3-small";

    console.log(`[document-processor] Config loaded. OCR(Mistral): ${!!ocrConf.mistral_api_key}, OpenAI: ${!!openaiConf.api_key}, Qdrant: ${!!qdrantConf.url}`);

    // Load R2 config
    const { data: r2Config } = await supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", file.organization_id)
      .eq("provider", "cloudflare_r2")
      .eq("is_active", true)
      .maybeSingle();

    const r2Conf = (r2Config?.config as any) || {};
    console.log(`[document-processor] R2 config: ${r2Conf.access_key_id ? "configured" : "not configured"}`);

    // --- STEP 1: Download file from R2 ---
    let fileBuffer: Uint8Array;
    const r2Key = file.storage_path;

    if (r2Conf.access_key_id && r2Conf.bucket_name) {
      console.log(`[document-processor] Downloading from R2: ${r2Key}`);
      const endpoint = r2Conf.endpoint_url || `https://${r2Conf.account_id}.r2.cloudflarestorage.com`;
      // URI-encode each path segment to handle spaces/special chars in filenames
      const encodedR2Key = r2Key.split("/").map((seg: string) => encodeURIComponent(seg)).join("/");
      const downloadUrl = `${endpoint}/${r2Conf.bucket_name}/${encodedR2Key}`;
      const downloadResp = await signedR2Request("GET", downloadUrl, r2Conf, new Uint8Array());
      if (!downloadResp.ok) {
        console.warn(`[document-processor] R2 download failed (${downloadResp.status}), trying Supabase Storage fallback`);
        const { data: storageData, error: dlErr } = await supabase.storage.from("vault-files").download(r2Key);
        if (dlErr || !storageData) {
          console.error(`[document-processor] Supabase Storage fallback also failed:`, dlErr);
          await supabase.from("files").update({ status: "error", error_message: "Failed to download file from storage" }).eq("id", fileId);
          return new Response(JSON.stringify({ error: "Download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        fileBuffer = new Uint8Array(await storageData.arrayBuffer());
      } else {
        fileBuffer = new Uint8Array(await downloadResp.arrayBuffer());
        console.log(`[document-processor] Downloaded ${fileBuffer.length} bytes from R2`);
      }
    } else {
      console.log(`[document-processor] No R2 config, trying Supabase Storage: ${r2Key}`);
      const { data: storageData, error: dlErr } = await supabase.storage.from("vault-files").download(r2Key);
      if (dlErr || !storageData) {
        console.error(`[document-processor] Supabase Storage download failed:`, dlErr);
        await supabase.from("files").update({ status: "error", error_message: "Failed to download file — no storage configured" }).eq("id", fileId);
        return new Response(JSON.stringify({ error: "Download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      fileBuffer = new Uint8Array(await storageData.arrayBuffer());
    }

    // --- STEP 2: Extract text ---
    let extractedText = "";
    let ocrUsed = false;
    let pageCount = 1;

    console.log(`[document-processor] Extracting text from ${file.mime_type}`);

    if (file.mime_type === "text/plain" || file.mime_type === "text/markdown") {
      extractedText = new TextDecoder().decode(fileBuffer);
    } else if (file.mime_type === "application/pdf") {
      // Always use Mistral OCR for PDFs — native regex extraction is unreliable
      if (ocrConf.mistral_api_key) {
        try {
          console.log(`[document-processor] Using Mistral OCR for PDF`);
          const ocrResult = await callMistralOCR(fileBuffer, file.mime_type, ocrConf.mistral_api_key);
          extractedText = ocrResult.text;
          pageCount = ocrResult.pageCount;
          ocrUsed = true;
          console.log(`[document-processor] Mistral OCR complete: ${extractedText.length} chars, ${pageCount} pages`);
        } catch (ocrErr: any) {
          console.error("[document-processor] Mistral OCR error:", ocrErr.message);
          extractedText = `[PDF document: ${file.original_name}] — OCR failed: ${ocrErr.message}`;
        }
      } else {
        console.warn(`[document-processor] No Mistral API key configured for PDF OCR`);
        extractedText = `[PDF document: ${file.original_name}] — No OCR configured. Add Mistral API key in Admin → Infrastructure.`;
      }
    } else if (
      file.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mime_type === "application/msword"
    ) {
      try {
        extractedText = await extractDocxText(fileBuffer);
        console.log(`[document-processor] DOCX text extracted: ${extractedText.length} chars`);
      } catch {
        extractedText = `[Word document: ${file.original_name}] — Text extraction failed.`;
      }
    } else if (
      file.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      extractedText = `[Spreadsheet: ${file.original_name}] — Text extraction pending.`;
    } else if (file.mime_type?.startsWith("image/")) {
      if (ocrConf.aws_access_key && ocrConf.aws_secret_key) {
        try {
          extractedText = await callTextract(fileBuffer, ocrConf);
          ocrUsed = true;
        } catch (ocrErr: any) {
          extractedText = `[Image: ${file.original_name}] — OCR failed: ${ocrErr.message}`;
        }
      } else {
        extractedText = `[Image: ${file.original_name}] — No OCR configured.`;
      }
    } else {
      extractedText = `[Unsupported format: ${file.mime_type}]`;
    }

    // Sanitize null bytes — PostgreSQL text columns reject \u0000
    extractedText = extractedText.replace(/\u0000/g, "");

    // --- STEP 3: Save extracted text to R2 ---
    let extractedTextR2Key: string | null = null;
    if (r2Conf.access_key_id && r2Conf.bucket_name && extractedText.length > 0) {
      extractedTextR2Key = `orgs/${file.organization_id}/${fileId}/extracted.txt`;
      const endpoint = r2Conf.endpoint_url || `https://${r2Conf.account_id}.r2.cloudflarestorage.com`;
      const putUrl = `${endpoint}/${r2Conf.bucket_name}/${extractedTextR2Key}`;
      const textBytes = new TextEncoder().encode(extractedText);
      await signedR2Request("PUT", putUrl, r2Conf, textBytes, "text/plain");
      console.log(`[document-processor] Saved extracted text to R2: ${extractedTextR2Key}`);
    }

    // --- STEP 4: Chunk text ---
    const chunks: { content: string; chunk_index: number; char_start: number; char_end: number; page_number: number | null }[] = [];

    if (extractedText.length > 0) {
      let start = 0;
      let idx = 0;
      while (start < extractedText.length) {
        const end = Math.min(start + chunkSize, extractedText.length);
        chunks.push({
          content: extractedText.slice(start, end),
          chunk_index: idx,
          char_start: start,
          char_end: end,
          page_number: null,
        });
        idx++;
        start = end - chunkOverlap;
        if (start >= extractedText.length) break;
        if (end === extractedText.length) break;
      }
    }

    console.log(`[document-processor] Created ${chunks.length} chunks`);

    // --- STEP 5: Embed chunks via OpenAI ---
    let embeddings: number[][] = [];
    if (openaiConf.api_key && chunks.length > 0) {
      try {
        console.log(`[document-processor] Embedding ${chunks.length} chunks with ${embeddingModel}`);
        embeddings = await embedChunks(
          chunks.map(c => c.content),
          openaiConf.api_key,
          embeddingModel
        );
        console.log(`[document-processor] Embeddings generated: ${embeddings.length}`);
      } catch (embErr: any) {
        console.error("[document-processor] Embedding error:", embErr.message);
      }
    } else if (!openaiConf.api_key) {
      console.warn("[document-processor] No OpenAI API key configured — skipping embeddings");
    }

    // --- STEP 6: Upsert to Qdrant ---
    const qdrantPointIds: string[] = [];
    if (qdrantConf.url && qdrantConf.api_key && embeddings.length > 0) {
      const collectionName = `${qdrantConf.collection_prefix || "org_"}${file.organization_id}`;

      console.log(`[document-processor] Upserting to Qdrant collection: ${collectionName}`);
      await ensureQdrantCollection(qdrantConf.url, qdrantConf.api_key, collectionName, embeddings[0].length);

      const points = chunks.map((c, i) => {
        const pointId = crypto.randomUUID();
        qdrantPointIds.push(pointId);
        return {
          id: pointId,
          vector: embeddings[i],
          payload: {
            file_id: fileId,
            org_id: file.organization_id,
            chunk_index: c.chunk_index,
            page_number: c.page_number,
            char_start: c.char_start,
            char_end: c.char_end,
            content: c.content,
            file_name: file.original_name,
            file_type: file.mime_type,
            ocr_used: ocrUsed,
          },
        };
      });

      for (let i = 0; i < points.length; i += 100) {
        const batch = points.slice(i, i + 100);
        const upsertResp = await fetch(`${qdrantConf.url}/collections/${collectionName}/points`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "api-key": qdrantConf.api_key,
          },
          body: JSON.stringify({ points: batch }),
        });
        if (!upsertResp.ok) {
          console.error(`[document-processor] Qdrant upsert failed:`, await upsertResp.text());
        }
      }
      console.log(`[document-processor] Upserted ${points.length} points to Qdrant`);
    } else if (!qdrantConf.url) {
      console.warn("[document-processor] No Qdrant configured — skipping vector upsert");
    }

    // --- STEP 7: Save chunks to Supabase ---
    if (chunks.length > 0) {
      const chunkRows = chunks.map((c, i) => ({
        file_id: fileId,
        organization_id: file.organization_id,
        content: c.content,
        chunk_index: c.chunk_index,
        page_number: c.page_number,
        char_start: c.char_start,
        char_end: c.char_end,
        token_count: Math.ceil(c.content.length / 4),
        qdrant_point_id: qdrantPointIds[i] || null,
      }));

      await supabase.from("file_chunks").delete().eq("file_id", fileId);
      const { error: chunkInsertErr } = await supabase.from("file_chunks").insert(chunkRows);
      if (chunkInsertErr) {
        console.error("[document-processor] Chunk insert error:", chunkInsertErr);
      }
    }

    // --- STEP 8: Update file record ---
    await supabase
      .from("files")
      .update({
        status: "ready",
        extracted_text: extractedText.slice(0, 50000),
        page_count: pageCount,
        ocr_used: ocrUsed,
        chunk_count: chunks.length,
        extracted_text_r2_key: extractedTextR2Key,
      })
      .eq("id", fileId);

    console.log(`[document-processor] ✅ Complete: ${chunks.length} chunks, ${embeddings.length} embeddings, OCR: ${ocrUsed}`);

    return new Response(
      JSON.stringify({ success: true, chunks: chunks.length, ocrUsed, embeddings: embeddings.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[document-processor] Fatal error:", err);
    
    // Try to update file status to error
    try {
      const { fileId } = await req.clone().json().catch(() => ({ fileId: null }));
      if (fileId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("files").update({ status: "error", error_message: err.message }).eq("id", fileId);
      }
    } catch { /* best effort */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- Mistral OCR ---
async function callMistralOCR(fileBytes: Uint8Array, mimeType: string, apiKey: string): Promise<{ text: string; pageCount: number }> {
  // Convert Uint8Array to base64
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < fileBytes.length; i += chunkSize) {
    const slice = fileBytes.subarray(i, Math.min(i + chunkSize, fileBytes.length));
    binary += String.fromCharCode(...slice);
  }
  const base64 = btoa(binary);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: dataUrl,
      },
      include_image_base64: false,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mistral OCR error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  const pageTexts = data.pages?.map((page: any) => page.markdown || "") ?? [];
  const text = pageTexts.join("\n\n");
  const pageCount = data.pages?.length ?? 1;

  return { text, pageCount };
}

// --- OpenAI Embeddings ---
async function embedChunks(texts: string[], apiKey: string, model: string): Promise<number[][]> {
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const resp = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: batch, model }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI embedding error ${resp.status}: ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    for (const item of data.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

// --- Qdrant helpers ---
async function ensureQdrantCollection(url: string, apiKey: string, name: string, vectorSize: number) {
  const checkResp = await fetch(`${url}/collections/${name}`, {
    headers: { "api-key": apiKey },
  });

  if (checkResp.status === 404) {
    await fetch(`${url}/collections/${name}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        vectors: { size: vectorSize, distance: "Cosine" },
      }),
    });
  }
}

// --- DOCX extraction (basic XML parsing) ---
async function extractDocxText(buffer: Uint8Array): Promise<string> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const matches = text.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  if (!matches) return "";
  return matches.map(m => {
    const inner = m.match(/>([^<]*)</);
    return inner ? inner[1] : "";
  }).join(" ");
}

// --- AWS Signature V4 helpers ---
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacSha256(key, data);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key).buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

// URI-encode per AWS SigV4 rules
function uriEncode(str: string, encodeSlash = true): string {
  let encoded = "";
  for (const ch of str) {
    if (
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" || ch === "-" || ch === "~" || ch === "."
    ) {
      encoded += ch;
    } else if (ch === "/" && !encodeSlash) {
      encoded += ch;
    } else {
      const bytes = new TextEncoder().encode(ch);
      for (const b of bytes) {
        encoded += "%" + b.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return encoded;
}

// --- R2 signed request ---
async function signedR2Request(method: string, url: string, config: any, body: Uint8Array, contentType?: string): Promise<Response> {
  const accessKeyId = (config.access_key_id || "").trim();
  const secretAccessKey = (config.secret_access_key || "").trim();

  const parsedUrl = new URL(url);
  const region = config.region === "auto" ? "auto" : config.region || "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join("");

  const canonicalUri = uriEncode(decodeURIComponent(parsedUrl.pathname), false) || "/";

  const canonicalRequest = [
    method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method !== "GET" ? body : undefined,
  });
}
