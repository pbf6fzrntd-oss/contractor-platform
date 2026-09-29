/**
 * Only allow redirects to our own pages (e.g. "/invite/abc"), never to other
 * websites. Anything suspicious falls back to the default.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
