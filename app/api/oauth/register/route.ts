import { isAllowedRedirectUri } from "@/lib/agent/oauth";
import { corsPreflight, json } from "@/lib/agent/oauth-metadata";
import { createAdminClient } from "@/lib/supabase/admin";

/** OAuth dynamic client registration (RFC 7591): an AI app introduces itself. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { client_name?: unknown; redirect_uris?: unknown } | null;
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirectUri)) {
    return json({ error: "invalid_redirect_uri", error_description: "Redirect URIs must be https (or http://localhost)." }, 400);
  }
  const name = typeof body?.client_name === "string" && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : "AI assistant";

  const { data, error } = await createAdminClient()
    .from("oauth_clients")
    .insert({ client_name: name, redirect_uris: uris })
    .select("id, client_name, redirect_uris, created_at")
    .single();
  if (error || !data) return json({ error: "server_error" }, 500);

  return json(
    {
      client_id: data.id,
      client_name: data.client_name,
      redirect_uris: data.redirect_uris,
      client_id_issued_at: Math.floor(Date.parse(data.created_at) / 1000),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201,
  );
}

export const OPTIONS = corsPreflight;
