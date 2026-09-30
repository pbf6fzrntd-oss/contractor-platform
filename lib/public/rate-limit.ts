import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";

/** Limits for public pages and outside AI agents, per visitor (IP) and business. */
export const LIMITS = {
  lookup: { perIp: 120, windowMinutes: 10 },
  booking: { perIp: 5, windowMinutes: 60, perOrgPerDay: 60 },
  /** "Try it live" demo businesses: per visitor, plus a cap for the whole site. */
  demo: { perIp: 8, windowMinutes: 60, perSitePerDay: 300 },
} as const;

/** The visitor's IP, salted and hashed (we never store raw IPs). */
export function visitorHash(headers: Headers): string {
  const ip = (headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  return createHash("sha256").update(`${serverEnv.fileSigningSecret}|${ip}`).digest("hex").slice(0, 32);
}

/** Records the request and says whether it's within the limits. */
export async function allowPublicRequest(db: AdminClient, orgId: string | null, ipHash: string, kind: "lookup" | "booking" | "demo"): Promise<boolean> {
  const rule = LIMITS[kind];
  const since = new Date(Date.now() - rule.windowMinutes * 60_000).toISOString();
  const { count } = await db.from("public_request_log").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("kind", kind).gte("created_at", since);
  if ((count ?? 0) >= rule.perIp) return false;
  if (kind === "demo") {
    const day = new Date(Date.now() - 86_400_000).toISOString();
    const { count: all } = await db.from("public_request_log").select("id", { count: "exact", head: true }).eq("kind", "demo").gte("created_at", day);
    if ((all ?? 0) >= LIMITS.demo.perSitePerDay) return false;
  }
  if (kind === "booking" && orgId) {
    const day = new Date(Date.now() - 86_400_000).toISOString();
    const { count: orgCount } = await db.from("public_request_log").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("kind", "booking").gte("created_at", day);
    if ((orgCount ?? 0) >= LIMITS.booking.perOrgPerDay) return false;
  }
  await db.from("public_request_log").insert({ org_id: orgId, ip_hash: ipHash, kind });
  return true;
}
