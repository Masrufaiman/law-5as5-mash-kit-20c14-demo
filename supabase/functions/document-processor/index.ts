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
      return new Response(
        JSON.stringify({ error: "File not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Load R2 config
    const { data: r2Config } = await supabase
      .from("api_integrations")
      .select("config")
      .eq("organization_id", file.organization_id)
      .eq("provider", "cloudflare_r2")
      .eq("is_active", true)
      .maybeSingle();

    const r2Conf = (r2Config?.config as any) || {};

    // --- STEP 1: Download file from R2 ---
    let fileBuffer: Uint8Array;
    const r2Key = file.storage_path;

    if (r2Conf.access_key_id && r2Conf.bucket_name) {
      const endpoint = r2Conf.endpoint_url || `https://${r2Conf.account_id}.r2.cloudflarestorage.com`;
      const downloadUrl = `${endpoint}/${r2Conf.bucket_name}/${r2Key}`;
      const downloadResp = await signedR2Request("GET", downloadUrl, r2Conf, new Uint8Array());
      if (!downloadResp.ok) {
        // Fallback to Supabase Storage
        const { data: storageData, error: dlErr } = await supabase.storage.from("vault-files").download(r2Key);
        if (dlErr || !storageData) {
          await supabase.from("files").update({ status: "error", error_message: "Failed to download file" }).eq("id", fileId);
          return new Response(JSON.stringify({ error: "Download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        fileBuffer = new Uint8Array(await storageData.arrayBuffer());
      } else {
        fileBuffer = new Uint8Array(await downloadResp.arrayBuffer());
      }
    } else {
      // No R2 config, try Supabase storage fallback
      const { data: storageData, error: dlErr } = await supabase.storage.from("vault-files").download(r2Key);
      if (dlErr || !storageData) {
        await supabase.from("files").update({ status: "error", error_message: "Failed to download file" }).eq("id", fileId);
        return new Response(JSON.stringify({ error: "Download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      fileBuffer = new Uint8Array(await storageData.arrayBuffer());
    }

    // --- STEP 2: Extract text ---
    let extractedText = "";
    let ocrUsed = false;
    let pageCount = 1;

    if (file.mime_type === "text/plain" || file.mime_type === "text/markdown") {
      extractedText = new TextDecoder().decode(fileBuffer);
    } else if (file.mime_type === "application/pdf") {
      // Try native text extraction first
      const textContent = new TextDecoder("utf-8", { fatal: false }).decode(fileBuffer);
      // Rough heuristic: if we can find readable text streams in the PDF
      const textMatches = textContent.match(/\(([^)]{2,})\)/g);
      const roughText = textMatches ? textMatches.map(m => m.slice(1, -1)).join(" ") : "";

      if (roughText.length > 100) {
        // Native PDF with extractable text
        extractedText = roughText;
      } else if (ocrConf.aws_access_key && ocrConf.aws_secret_key) {
        // Scanned PDF — use AWS Textract
        try {
          const textractResult = await callTextract(fileBuffer, ocrConf);
          extractedText = textractResult;
          ocrUsed = true;
        } catch (ocrErr: any) {
          console.error("Textract error:", ocrErr.message);
          extractedText = `[PDF document: ${file.original_name}] — OCR failed: ${ocrErr.message}`;
        }
      } else {
        extractedText = `[PDF document: ${file.original_name}] — No OCR configured. Configure AWS Textract in Admin → Infrastructure.`;
      }
    } else if (
      file.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mime_type === "application/msword"
    ) {
      // Basic DOCX text extraction (XML parsing)
      try {
        extractedText = await extractDocxText(fileBuffer);
      } catch {
        extractedText = `[Word document: ${file.original_name}] — Text extraction failed.`;
      }
    } else if (
      file.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      extractedText = `[Spreadsheet: ${file.original_name}] — Text extraction pending.`;
    } else if (file.mime_type?.startsWith("image/")) {
      // Image — try OCR
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

    // --- STEP 3: Save extracted text to R2 ---
    let extractedTextR2Key: string | null = null;
    if (r2Conf.access_key_id && r2Conf.bucket_name && extractedText.length > 0) {
      extractedTextR2Key = `orgs/${file.organization_id}/${fileId}/extracted.txt`;
      const endpoint = r2Conf.endpoint_url || `https://${r2Conf.account_id}.r2.cloudflarestorage.com`;
      const putUrl = `${endpoint}/${r2Conf.bucket_name}/${extractedTextR2Key}`;
      const textBytes = new TextEncoder().encode(extractedText);
      await signedR2Request("PUT", putUrl, r2Conf, textBytes, "text/plain");
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

    // --- STEP 5: Embed chunks via OpenAI ---
    let embeddings: number[][] = [];
    if (openaiConf.api_key && chunks.length > 0) {
      try {
        embeddings = await embedChunks(
          chunks.map(c => c.content),
          openaiConf.api_key,
          embeddingModel
        );
      } catch (embErr: any) {
        console.error("Embedding error:", embErr.message);
      }
    }

    // --- STEP 6: Upsert to Qdrant ---
    const qdrantPointIds: string[] = [];
    if (qdrantConf.url && qdrantConf.api_key && embeddings.length > 0) {
      const collectionName = `${qdrantConf.collection_prefix || "org_"}${file.organization_id}`;

      // Ensure collection exists
      await ensureQdrantCollection(qdrantConf.url, qdrantConf.api_key, collectionName, embeddings[0].length);

      // Upsert points
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

      // Batch upsert (max 100 per batch)
      for (let i = 0; i < points.length; i += 100) {
        const batch = points.slice(i, i + 100);
        await fetch(`${qdrantConf.url}/collections/${collectionName}/points`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "api-key": qdrantConf.api_key,
          },
          body: JSON.stringify({ points: batch }),
        });
      }
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

      // Delete old chunks first
      await supabase.from("file_chunks").delete().eq("file_id", fileId);
      await supabase.from("file_chunks").insert(chunkRows);
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

    return new Response(
      JSON.stringify({ success: true, chunks: chunks.length, ocrUsed, embeddings: embeddings.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("document-processor error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// --- AWS Textract ---
async function callTextract(fileBytes: Uint8Array, ocrConf: any): Promise<string> {
  const region = ocrConf.aws_region || "eu-central-1";
  const service = "textract";
  const host = `textract.${region}.amazonaws.com`;
  const url = `https://${host}`;

  const body = JSON.stringify({
    Document: {
      Bytes: btoa(String.fromCharCode(...fileBytes.slice(0, 5 * 1024 * 1024))), // max 5MB for sync
    },
  });

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = new TextEncoder().encode(body);
  const payloadHash = await sha256Hex(bodyBytes);

  const headers: Record<string, string> = {
    host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "content-type": "application/x-amz-json-1.1",
    "x-amz-target": "Textract.DetectDocumentText",
  };

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${headers[k]}\n`).join("");

  const canonicalRequest = [
    "POST",
    "/",
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

  const signingKey = await getSignatureKey(ocrConf.aws_secret_key, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${ocrConf.aws_access_key}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { ...headers, Authorization: authorization },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Textract error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const result = await resp.json();
  const lines = (result.Blocks || [])
    .filter((b: any) => b.BlockType === "LINE")
    .map((b: any) => b.Text);

  return lines.join("\n");
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
  // Check if collection exists
  const checkResp = await fetch(`${url}/collections/${name}`, {
    headers: { "api-key": apiKey },
  });

  if (checkResp.status === 404) {
    // Create collection
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
  // DOCX is a ZIP file. We need to find document.xml inside it.
  // Simple approach: look for text between <w:t> tags
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

// --- R2 signed request ---
async function signedR2Request(method: string, url: string, config: any, body: Uint8Array, contentType?: string): Promise<Response> {
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

  const canonicalRequest = [method, parsedUrl.pathname, parsedUrl.search.replace("?", ""), canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(new TextEncoder().encode(canonicalRequest))].join("\n");

  const signingKey = await getSignatureKey(config.secret_access_key, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${config.access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: method === "PUT" ? body : undefined,
  });
}
