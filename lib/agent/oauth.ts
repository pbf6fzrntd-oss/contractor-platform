import { createHash, randomBytes } from "node:crypto";
import { hasFeature, type Plan } from "@/lib/entitlements";
import type { Role } from "@/lib/org";

/**
 * Rules for "Connect" (OAuth 2.1 with PKCE), the standard way apps like Claude
 * and ChatGPT ask an owner for permission instead of a pasted key.
 */

export const ACCESS_LEVELS = ["read", "read_write", "full"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  read: "Read only",
  read_write: "Read and act",
  full: "Everything",
};

export const ACCESS_DESCRIPTION: Record<AccessLevel, string> = {
  read: "Look things up. Can't text anyone or change anything.",
  read_write:
    "Day-to-day work: reply to leads, change stages, mark jobs done, manage customers, send rain delays and running-late texts (after you confirm).",
  full: "Everything above, plus seasonal campaigns (after you confirm), message wording and automation settings.",
};

const RANK: Record<AccessLevel, number> = { read: 0, read_write: 1, full: 2 };

/**
 * The most an AI connection can do, by the role of the person who connected it.
 * Owners: everything. Office managers: day-to-day work (never campaigns,
 * message wording or automation settings, which are owner decisions).
 */
export const ROLE_MAX_ACCESS: Record<Role, AccessLevel> = { owner: "full", manager: "read_write" };

export function levelsForRole(role: Role): AccessLevel[] {
  return ACCESS_LEVELS.filter((l) => RANK[l] <= RANK[ROLE_MAX_ACCESS[role]]);
}

/** A connection never does more than its person's role allows, even if it was granted more. */
export function capAccess(access: AccessLevel, role: Role): AccessLevel {
  return RANK[access] <= RANK[ROLE_MAX_ACCESS[role]] ? access : ROLE_MAX_ACCESS[role];
}

/** May this person connect AI tools? Owners always; office managers if the plan includes it. */
export function canConnectAi(role: Role, plan: Plan): boolean {
  return role === "owner" || hasFeature(plan, "team_ai");
}

/** Does a key with `access` allow something that needs `needed`? */
export function accessAllows(access: string, needed: AccessLevel): boolean {
  return (RANK[access as AccessLevel] ?? -1) >= RANK[needed];
}

export function isAccessLevel(v: unknown): v is AccessLevel {
  return typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);
}

/** The level an app asked for ("scope"), defaulting to day-to-day work. */
export function accessFromScope(scope: string | null | undefined): AccessLevel {
  const words = (scope ?? "").split(/\s+/);
  if (words.includes("full")) return "full";
  if (words.includes("read_write")) return "read_write";
  if (words.includes("read") && words.length === 1) return "read";
  return "read_write";
}

/** PKCE S256: the challenge is base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string | null | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return pkceChallenge(verifier) === challenge;
}

/**
 * Where an app may send the owner back to after they tap Allow: any https
 * address, or a local address on the owner's own computer (desktop apps).
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

export function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(24).toString("base64url")}`;
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const ACCESS_TOKEN_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_DAYS = 60;
export const CODE_SECONDS = 10 * 60;
