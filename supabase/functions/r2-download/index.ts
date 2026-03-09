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
    const { r2Key } = await req.json();

    if (!r2Key) {
      return new Response(JSON.stringify({ error: "r2Key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ error: "No organization" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the file belongs to user's org
    const { data: file } = await serviceClient
      .from("files")
      .select("organization_id")
      .eq("storage_path", r2Key)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (!file) {
      return new Response(JSON.stringify({ error: "File not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get R2 config
    const { data: r2Config } = await serviceClient
      .from("api_integrations")
      .select("config")
      .eq("organization_id", profile.organization_id)
      .eq("provider", "cloudflare_r2")
      .eq("is_active", true)
      .maybeSingle();

    if (!r2Config?.config) {
      return new Response(JSON.stringify({ error: "R2 not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = r2Config.config as any;

    // If public URL is configured, return that
    if (config.public_url) {
      return new Response(
        JSON.stringify({ url: `${config.public_url}/${r2Key}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Otherwise generate a pre-signed URL (simplified - returns direct R2 URL)
    const endpoint = config.endpoint_url || `https://${config.account_id}.r2.cloudflarestorage.com`;
    const url = `${endpoint}/${config.bucket_name}/${r2Key}`;

    // For now, return the endpoint URL - in production you'd generate a pre-signed URL
    return new Response(
      JSON.stringify({ url, note: "Configure a public URL in Admin → Storage for direct access" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
