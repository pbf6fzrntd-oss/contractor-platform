import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";

export function positiveLimit(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= 10000 ? value : fallback;
}

/** Limits for public pages and outside AI agents, per visitor (IP) and business. */
export const LIMITS = {
  lookup: { perIp: 120, windowMinutes: 10 },
  booking: { perIp: 5, windowMinutes: 60, perOrgPerDay: 60 },
  /** "Try it live" demo businesses: per visitor, plus a cap for the whole site. */
  demo: { perIp: positiveLimit(process.env.DEMO_STARTS_PER_HOUR, 8), windowMinutes: 60, perSitePerDay: 300 },
} as const;

/** The visitor's IP, salted and hashed (we never store raw IPs). */
export function visitorHash(headers: Headers): string {
  const ip = (headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? "unknown").split(",")[0].trim();
  return createHash("sha256").update(`${serverEnv.fileSigningSecret}|${ip}`).digest("hex").slice(0, 32);
}

/** Records the request and says whether it's within the limits. */
export async function allowPublicRequest(db: AdminClient, orgId: string | null, ipHash: string, kind: "lookup" | "booking" | "demo"): Promise<boolean> {
  const rule = LIMITS[kind];
  const { data, error } = await db.rpc("reserve_public_request", {
    p_org_id: orgId ?? undefined, p_ip_hash: ipHash, p_kind: kind,
    p_per_ip: rule.perIp, p_window_minutes: rule.windowMinutes,
    p_per_org: kind === "booking" ? LIMITS.booking.perOrgPerDay : 0,
    p_per_site: kind === "demo" ? LIMITS.demo.perSitePerDay : 0,
  });
  // A database outage must not open the paid/public endpoint without limits.
  if (error) return false;
  return data === true;
}
