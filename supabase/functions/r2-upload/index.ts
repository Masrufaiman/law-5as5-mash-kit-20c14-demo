import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // Get org ID from profile
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await serviceClient
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

    // Get R2 config
    const { data: r2Config } = await serviceClient
      .from("api_integrations")
      .select("config")
      .eq("organization_id", orgId)
      .eq("provider", "cloudflare_r2")
      .eq("is_active", true)
      .maybeSingle();

    if (!r2Config?.config) {
      return new Response(
        JSON.stringify({ error: "R2 not configured. Please configure R2 in Admin → Storage." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = r2Config.config as any;
    const endpoint = config.endpoint_url || `https://${config.account_id}.r2.cloudflarestorage.com`;

    // Check if this is a test connection request
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (body.action === "test_connection") {
        // Test by listing bucket
        const url = `${endpoint}/${config.bucket_name}?list-type=2&max-keys=1`;
        const now = new Date();
        const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 8);
        
        try {
          const testResp = await signedR2Request("GET", url, config, new Uint8Array());
          if (testResp.ok || testResp.status === 200) {
            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const text = await testResp.text();
          return new Response(JSON.stringify({ error: `R2 returned ${testResp.status}: ${text.slice(0, 200)}` }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Handle file upload (multipart form data)
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const r2Key = formData.get("r2Key") as string;

    if (!file || !r2Key) {
      return new Response(JSON.stringify({ error: "File and r2Key are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const encodedR2Key = r2Key.split("/").map((s: string) => encodeURIComponent(s)).join("/");
    const putUrl = `${endpoint}/${config.bucket_name}/${encodedR2Key}`;

    const putResp = await signedR2Request("PUT", putUrl, config, fileBytes, file.type);

    if (!putResp.ok) {
      const errText = await putResp.text();
      return new Response(
        JSON.stringify({ error: `R2 upload failed: ${putResp.status} ${errText.slice(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    await putResp.text(); // consume body

    return new Response(
      JSON.stringify({ success: true, r2_key: r2Key }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// URI-encode a string per AWS SigV4 rules (encode everything except unreserved chars)
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

// Build sorted canonical query string from URL search params
function getCanonicalQueryString(parsedUrl: URL): string {
  const params = Array.from(parsedUrl.searchParams.entries());
  params.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0);
  return params.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join("&");
}

// AWS Signature V4 for R2
async function signedR2Request(
  method: string,
  url: string,
  config: any,
  body: Uint8Array,
  contentType?: string
): Promise<Response> {
  const accessKeyId = (config.access_key_id || "").trim();
  const secretAccessKey = (config.secret_access_key || "").trim();

  const parsedUrl = new URL(url);
  const region = config.region === "auto" ? "auto" : config.region || "auto";
  const service = "s3";
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  // Hash payload
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host: parsedUrl.host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };
  if (contentType) headers["content-type"] = contentType;

  const signedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join("");

  // Properly encode the URI path (don't encode slashes)
  const canonicalUri = uriEncode(decodeURIComponent(parsedUrl.pathname), false) || "/";
  const canonicalQueryString = getCanonicalQueryString(parsedUrl);

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
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

  const fetchHeaders: Record<string, string> = {
    ...headers,
    Authorization: authorization,
  };

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: method === "PUT" ? body : undefined,
  });
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const encoded = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  const sig = await hmacSha256(key, data);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + key).buffer as ArrayBuffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}
