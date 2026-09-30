import { generateApiKey } from "@/lib/agent/keys";
import {
  ACCESS_TOKEN_SECONDS,
  REFRESH_TOKEN_DAYS,
  randomToken,
  sha256,
  verifyPkce,
} from "@/lib/agent/oauth";
import { corsPreflight, json } from "@/lib/agent/oauth-metadata";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

/**
 * Swaps a one-time code (after the owner tapped Allow) or a refresh token for
 * an access token. Access tokens are ordinary assistant keys that expire
 * after an hour, so they show up (and can be revoked) in Settings → AI assistants.
 */
const invalid = (error: string, description: string) => json({ error, error_description: description }, 400);

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  const form = await request.formData().catch(() => null);
  const out: Record<string, string> = {};
  form?.forEach((v, k) => (out[k] = String(v)));
  return out;
}

async function issueTokens(db: AdminClient, keyId: string, access: string, expectedRefreshHash?: string) {
  const { key, prefix, hash } = generateApiKey();
  const refresh = randomToken("llr_");
  const now = Date.now();
  let update = db
    .from("api_keys")
    .update({
      key_hash: hash,
      key_prefix: prefix,
      expires_at: new Date(now + ACCESS_TOKEN_SECONDS * 1000).toISOString(),
      refresh_hash: sha256(refresh),
      refresh_expires_at: new Date(now + REFRESH_TOKEN_DAYS * 86_400_000).toISOString(),
    })
    .eq("id", keyId).is("revoked_at", null);
  if (expectedRefreshHash) update = update.eq("refresh_hash", expectedRefreshHash).gt("refresh_expires_at", new Date(now).toISOString());
  const { data: changed, error } = await update.select("id");
  if (error) return json({ error: "server_error" }, 500);
  if (changed?.length !== 1) return invalid("invalid_grant", "This connection changed. Connect again.");
  return json({
    access_token: key,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refresh,
    scope: access,
  });
}

export async function POST(request: Request) {
  const p = await readParams(request);
  const db = createAdminClient();

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.client_id || !p.redirect_uri) return invalid("invalid_request", "Missing code, client_id or redirect_uri.");
    const { data: code } = await db.from("oauth_codes").select("*").eq("code_hash", sha256(p.code)).maybeSingle();
    if (!code || code.used_at || Date.parse(code.expires_at) < Date.now()) {
      return invalid("invalid_grant", "This code is invalid, used or expired.");
    }
    if (code.client_id !== p.client_id || code.redirect_uri !== p.redirect_uri) {
      return invalid("invalid_grant", "The code was issued to a different app or address.");
    }
    if (!verifyPkce(p.code_verifier, code.code_challenge)) return invalid("invalid_grant", "PKCE check failed.");

    // Mark used first, so a code can never be exchanged twice.
    const { data: claimed } = await db
      .from("oauth_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("code_hash", code.code_hash)
      .is("used_at", null)
      .select("code_hash");
    if (!claimed?.length) return invalid("invalid_grant", "This code was already used.");

    const { data: client } = await db.from("oauth_clients").select("client_name").eq("id", code.client_id).single();
    const placeholder = generateApiKey();
    const { data: key, error } = await db
      .from("api_keys")
      .insert({
        org_id: code.org_id,
        name: client?.client_name ?? "AI assistant",
        key_prefix: placeholder.prefix,
        key_hash: placeholder.hash,
        access: code.access,
        created_by: code.user_id,
        source: "oauth",
        oauth_client_id: code.client_id,
      })
      .select("id, access")
      .single();
    if (error || !key) return json({ error: "server_error" }, 500);
    return issueTokens(db, key.id, key.access);
  }

  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token) return invalid("invalid_request", "Missing refresh_token.");
    const { data: key } = await db
      .from("api_keys")
      .select("id, org_id, created_by, access, oauth_client_id, revoked_at, refresh_expires_at")
      .eq("refresh_hash", sha256(p.refresh_token))
      .maybeSingle();
    if (!key || key.revoked_at || !key.refresh_expires_at || Date.parse(key.refresh_expires_at) < Date.now()) {
      return invalid("invalid_grant", "This connection was revoked or expired. Connect again.");
    }
    if (p.client_id && key.oauth_client_id !== p.client_id) return invalid("invalid_grant", "Wrong app for this token.");
    // Someone who left the team can't keep their connection alive.
    if (key.created_by) {
      const { data: member } = await db.from("memberships").select("role").eq("org_id", key.org_id).eq("user_id", key.created_by).maybeSingle();
      if (!member) return invalid("invalid_grant", "The person who connected this is no longer on the team.");
    }
    return issueTokens(db, key.id, key.access, sha256(p.refresh_token));
  }

  return invalid("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export const OPTIONS = corsPreflight;
