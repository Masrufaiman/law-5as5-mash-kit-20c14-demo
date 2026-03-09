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

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("vault-files")
      .download(file.storage_path);

    if (downloadError || !fileData) {
      await supabase
        .from("files")
        .update({ status: "error", error_message: "Failed to download file from storage" })
        .eq("id", fileId);
      return new Response(
        JSON.stringify({ error: "Download failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extractedText = "";

    // Extract text based on mime type
    if (file.mime_type === "text/plain" || file.mime_type === "text/markdown") {
      extractedText = await fileData.text();
    } else if (file.mime_type === "application/pdf") {
      // For PDF: store raw text extraction placeholder
      // Full PDF parsing would require a library like pdf-parse
      extractedText = `[PDF document: ${file.original_name}] — Text extraction pending advanced processing.`;
    } else if (
      file.mime_type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mime_type === "application/msword"
    ) {
      extractedText = `[Word document: ${file.original_name}] — Text extraction pending advanced processing.`;
    } else if (
      file.mime_type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      extractedText = `[Spreadsheet: ${file.original_name}] — Text extraction pending advanced processing.`;
    } else {
      extractedText = `[Unsupported format: ${file.mime_type}]`;
    }

    // Create chunks (simple splitting for now, ~1000 chars per chunk)
    const CHUNK_SIZE = 1000;
    const chunks: { content: string; chunk_index: number; page_number: number | null }[] = [];

    if (extractedText.length > 0) {
      for (let i = 0; i < extractedText.length; i += CHUNK_SIZE) {
        chunks.push({
          content: extractedText.slice(i, i + CHUNK_SIZE),
          chunk_index: chunks.length,
          page_number: null,
        });
      }
    }

    // Insert chunks
    if (chunks.length > 0) {
      const chunkRows = chunks.map((c) => ({
        file_id: fileId,
        organization_id: file.organization_id,
        content: c.content,
        chunk_index: c.chunk_index,
        page_number: c.page_number,
        token_count: Math.ceil(c.content.length / 4), // rough estimate
      }));

      await supabase.from("file_chunks").insert(chunkRows);
    }

    // Update file as ready
    await supabase
      .from("files")
      .update({
        status: "ready",
        extracted_text: extractedText.slice(0, 50000), // cap at 50k chars
        page_count: chunks.length > 0 ? 1 : null,
      })
      .eq("id", fileId);

    return new Response(
      JSON.stringify({ success: true, chunks: chunks.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("document-processor error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
