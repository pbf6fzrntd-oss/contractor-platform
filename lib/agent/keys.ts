import { createHash, randomBytes } from "node:crypto";

/**
 * AI assistant keys. The full key is shown to the owner once; we only keep a
 * SHA-256 hash, so a database leak doesn't leak working keys.
 */
export const KEY_PREFIX = "llk_";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Pulls the key out of an "Authorization: Bearer <key>" header. */
export function keyFromAuthHeader(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m && m[1].startsWith(KEY_PREFIX) ? m[1] : null;
}

/** Max tool calls per key per minute. */
export const RATE_LIMIT_PER_MINUTE = 60;
