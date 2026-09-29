"use server";

import { redirect } from "next/navigation";
import { canConnectAi, CODE_SECONDS, isAccessLevel, levelsForRole, randomToken, sha256 } from "@/lib/agent/oauth";
import { getAppContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

type Request = { client_id: string; redirect_uri: string; code_challenge: string; state: string };

/** Re-checks the app and return address on the server, never trusting the form. */
async function validClient(req: Request) {
  const { data: client } = await createAdminClient()
    .from("oauth_clients")
    .select("id, redirect_uris")
    .eq("id", req.client_id)
    .maybeSingle();
  return client && client.redirect_uris.includes(req.redirect_uri) ? client : null;
}

function back(uri: string, params: Record<string, string>): never {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  redirect(u.toString());
}

export async function approveConnection(req: Request, formData: FormData): Promise<void> {
  const ctx = await getAppContext();
  if (!ctx || !canConnectAi(ctx.role, ctx.plan)) redirect("/home");
  if (!(await validClient(req)) || !req.code_challenge) redirect("/home");
  const access = String(formData.get("access"));
  if (!isAccessLevel(access) || !levelsForRole(ctx.role).includes(access)) redirect("/home");

  const code = randomToken("llc_");
  await createAdminClient()
    .from("oauth_codes")
    .insert({
      code_hash: sha256(code),
      client_id: req.client_id,
      org_id: ctx.org.id,
      user_id: ctx.userId,
      access,
      redirect_uri: req.redirect_uri,
      code_challenge: req.code_challenge,
      expires_at: new Date(Date.now() + CODE_SECONDS * 1000).toISOString(),
    });
  back(req.redirect_uri, { code, state: req.state });
}

export async function denyConnection(req: Request): Promise<void> {
  if (!(await validClient(req))) redirect("/home");
  back(req.redirect_uri, { error: "access_denied", state: req.state });
}
