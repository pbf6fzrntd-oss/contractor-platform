import "server-only";
import type { AgentContext } from "@/lib/agent/server";
import { hashApiKey, keyFromAuthHeader, RATE_LIMIT_PER_MINUTE } from "@/lib/agent/keys";
import { canConnectAi, capAccess, isAccessLevel } from "@/lib/agent/oauth";
import { isBillingActive } from "@/lib/entitlements";
import { toOrg, toRole, type Role } from "@/lib/org";
import type { AdminClient } from "@/lib/supabase/admin";

export type AgentAuth =
  | { ok: true; ctx: AgentContext }
  | { ok: false; status: 401 | 403 | 429; message: string };

/** Checks an AI assistant's key and works out which business it acts for. */
export async function authenticateAgent(db: AdminClient, authorization: string | null): Promise<AgentAuth> {
  const key = keyFromAuthHeader(authorization);
  if (!key) return { ok: false, status: 401, message: "Missing or malformed key. Send 'Authorization: Bearer llk_...'." };

  const { data: row } = await db
    .from("api_keys")
    .select("id, org_id, access, created_by, revoked_at, expires_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!row || row.revoked_at) return { ok: false, status: 401, message: "This key is invalid or was revoked." };
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    return { ok: false, status: 401, message: "This connection's access token expired. Refresh it or connect again." };
  }

  const since = new Date(Date.now() - 60_000).toISOString();
  const [{ data: org }, { data: sub }, { count: recent }] = await Promise.all([
    db.from("organizations").select("*").eq("id", row.org_id).single(),
    db.from("subscriptions").select("status").eq("org_id", row.org_id).maybeSingle(),
    db.from("agent_activity").select("id", { count: "exact", head: true }).eq("api_key_id", row.id).gte("created_at", since),
  ]);
  if (!org) return { ok: false, status: 401, message: "This key's business no longer exists." };
  if (!isBillingActive(sub?.status)) return { ok: false, status: 403, message: "This business's subscription isn't active." };
  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, status: 429, message: "Too many requests. Wait a minute and try again." };
  }
  const { data: plan } = await db.from("plans").select("*").eq("id", org.plan_id).single();

  // A connection only works while the person who made it is on the team, and
  // never does more than their role allows. (Keys whose creator's login was
  // deleted predate team access and were always owner keys.)
  let role: Role = "owner";
  if (row.created_by) {
    const { data: member } = await db.from("memberships").select("role").eq("org_id", row.org_id).eq("user_id", row.created_by).maybeSingle();
    if (!member) return { ok: false, status: 401, message: "The person who connected this assistant is no longer on the team." };
    role = toRole(member.role);
  }
  if (!canConnectAi(role, plan!)) {
    return { ok: false, status: 403, message: "This business's plan doesn't include AI tools for office managers. Ask the owner." };
  }

  await db.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return {
    ok: true,
    ctx: {
      db,
      org: toOrg(org),
      plan: plan!,
      keyId: row.id,
      access: capAccess(isAccessLevel(row.access) ? row.access : "read", role),
      userId: row.created_by,
      role,
    },
  };
}
