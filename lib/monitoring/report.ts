import { randomUUID } from "node:crypto";
import { authHeader, buildEnvelope, envelopeUrl, parseDsn, type ErrorReport } from "@/lib/monitoring/sentry";

/**
 * Sends an error alert to Sentry when SENTRY_DSN is set (otherwise it's only
 * logged). Never throws: reporting must not break the page.
 */
export async function reportError(error: unknown, info: Omit<ErrorReport, "name" | "message" | "stack" | "environment" | "release">): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const digest = typeof error === "object" && error && "digest" in error ? String((error as { digest: unknown }).digest) : info.digest;
  const report: ErrorReport = {
    ...info,
    digest,
    name: e.name,
    message: e.message,
    stack: e.stack,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  };
  try {
    await fetch(envelopeUrl(dsn), {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": authHeader(dsn) },
      body: buildEnvelope(report, randomUUID().replace(/-/g, ""), new Date(), dsn),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Sentry unreachable: the error is still in the server logs.
  }
}
