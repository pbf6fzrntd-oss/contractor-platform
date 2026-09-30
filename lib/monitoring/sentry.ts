/**
 * Error alerts to Sentry, without Sentry's SDK (pure helpers: no network here).
 * We send only what's needed to fix a bug: the error type and message, the
 * code location, and which page/route. Text is scrubbed of phone numbers,
 * emails and long tokens, and customer messages are never included.
 */

export type Dsn = { host: string; projectId: string; publicKey: string; protocol: string; pathPrefix: string };

/** "https://KEY@o123.ingest.sentry.io/456" → parts, or null if it isn't a DSN. */
export function parseDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const parts = u.pathname.split("/").filter(Boolean);
    const projectId = parts.pop();
    if (!u.username || !projectId || !/^\d+$/.test(projectId) || !["https:", "http:"].includes(u.protocol)) return null;
    return { host: u.host, projectId, publicKey: u.username, protocol: u.protocol, pathPrefix: parts.length ? `/${parts.join("/")}` : "" };
  } catch {
    return null;
  }
}

export function envelopeUrl(d: Dsn): string {
  return `${d.protocol}//${d.host}${d.pathPrefix}/api/${d.projectId}/envelope/`;
}

export function authHeader(d: Dsn): string {
  return `Sentry sentry_version=7, sentry_key=${d.publicKey}, sentry_client=contractor-platform/1.0`;
}

/** Removes personal details and secrets from text before it leaves the app. */
export function scrub(text: string, max = 2000): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sk|pk|rk|whsec)_[A-Za-z0-9_]{12,}/g, "[secret]")
    .replace(/\b(?:AC|SK)[0-9a-f]{32}\b/g, "[secret]")
    .replace(/\+?\b1?\d{10}\b/g, "[phone]")
    .replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .slice(0, max);
}

/** Drops the query string (it can hold tokens or customer details). */
export function cleanPath(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  return scrub(path.split("?")[0].split("#")[0], 200);
}

export type ErrorReport = {
  name: string;
  message: string;
  stack?: string;
  digest?: string;
  where: "server" | "browser";
  path?: string;
  route?: string;
  routeType?: string;
  environment: string;
  release?: string;
};

/** A Sentry envelope (their upload format) for one error. */
export function buildEnvelope(r: ErrorReport, eventId: string, now: Date, dsn: Dsn): string {
  const event = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    platform: "javascript",
    level: "error",
    logger: r.where,
    environment: r.environment,
    ...(r.release ? { release: r.release } : {}),
    transaction: r.route ?? cleanPath(r.path),
    tags: { where: r.where, ...(r.routeType ? { route_type: r.routeType } : {}), ...(r.digest ? { digest: r.digest } : {}) },
    request: r.path ? { url: cleanPath(r.path) } : undefined,
    exception: { values: [{ type: scrub(r.name, 100), value: scrub(r.message) }] },
    extra: r.stack ? { stack: scrub(r.stack, 6000) } : undefined,
  };
  const header = { event_id: eventId, sent_at: now.toISOString(), dsn: `${dsn.protocol}//${dsn.publicKey}@${dsn.host}${dsn.pathPrefix}/${dsn.projectId}` };
  return `${JSON.stringify(header)}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}
