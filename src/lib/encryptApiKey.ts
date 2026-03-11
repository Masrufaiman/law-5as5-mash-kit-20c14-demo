import { supabase } from "@/integrations/supabase/client";

/**
 * Encrypt an API key server-side using the encrypt-api-key edge function.
 * Returns { api_key_encrypted, api_key_iv } as hex strings.
 */
export async function encryptApiKey(apiKey: string): Promise<{ api_key_encrypted: string; api_key_iv: string }> {
  const { data, error } = await supabase.functions.invoke("encrypt-api-key", {
    body: { api_key: apiKey },
  });
  if (error) throw new Error(error.message || "Failed to encrypt API key");
  if (data?.error) throw new Error(data.error);
  return { api_key_encrypted: data.api_key_encrypted, api_key_iv: data.api_key_iv };
}
