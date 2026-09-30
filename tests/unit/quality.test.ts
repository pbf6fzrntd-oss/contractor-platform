import { describe, expect, it } from "vitest";
import { RETENTION, retentionCutoff } from "@/lib/automation/retention";
import { authHeader, buildEnvelope, cleanPath, envelopeUrl, parseDsn, scrub } from "@/lib/monitoring/sentry";

describe("error alerts (Sentry)", () => {
  it("reads a Sentry DSN, and ignores anything else", () => {
    const d = parseDsn("https://abc123@o42.ingest.us.sentry.io/4507");
    expect(d).toEqual({ host: "o42.ingest.us.sentry.io", projectId: "4507", publicKey: "abc123", protocol: "https:", pathPrefix: "" });
    expect(envelopeUrl(d!)).toBe("https://o42.ingest.us.sentry.io/api/4507/envelope/");
    expect(authHeader(d!)).toContain("sentry_key=abc123");
    for (const bad of [undefined, "", "not a url", "https://o42.ingest.sentry.io/4507", "https://abc@o42.ingest.sentry.io/notanumber", "ftp://a@b/1"]) expect(parseDsn(bad)).toBeNull();
  });

  it("never sends phone numbers, emails or secrets", () => {
    const text = "Failed texting +18435551234 / (843) 555-1234 for dana@lawn.test with key sk_live_abcdefghijklmnop1234 token 3f2b8c1e4a5d4e6f8a9b0c1d2e3f4a5bGrYlOIcMC3BvaLnD";
    const out = scrub(text);
    expect(out).not.toMatch(/555|dana@|sk_live|GrYl/);
    expect(out).toContain("[phone]");
    expect(out).toContain("[email]");
    expect(scrub("word ".repeat(1000)).length).toBe(2000);
  });

  it("drops query strings from paths (they can hold tokens)", () => {
    expect(cleanPath("/m/abc?lang=es&token=secret")).toBe("/m/abc");
    expect(cleanPath("/inbox/123#x")).toBe("/inbox/123");
    expect(cleanPath(undefined)).toBeUndefined();
  });

  it("builds a Sentry envelope with only the error, place and page", () => {
    const d = parseDsn("https://abc@o1.ingest.sentry.io/9")!;
    const env = buildEnvelope(
      { name: "TypeError", message: "x is undefined for 843-555-1234", stack: "at foo (app/page.tsx:1)", where: "server", path: "/inbox?q=1", route: "/inbox", routeType: "render", environment: "production", release: "abc" },
      "0".repeat(32),
      new Date("2026-10-01T12:00:00Z"),
      d,
    );
    const [header, item, event] = env.trim().split("\n").map((l) => JSON.parse(l));
    expect(header.event_id).toBe("0".repeat(32));
    expect(item).toEqual({ type: "event" });
    expect(event.exception.values[0]).toEqual({ type: "TypeError", value: "x is undefined for [phone]" });
    expect(event.request.url).toBe("/inbox");
    expect(event.tags).toEqual({ where: "server", route_type: "render" });
    expect(JSON.stringify(event)).not.toMatch(/555|q=1/);
  });
});

describe("daily cleanup", () => {
  it("never touches the business's records or the consent log", () => {
    const tables = RETENTION.map((r) => r.table as string);
    for (const keep of ["messages", "consent_events", "contacts", "leads", "jobs", "bookings", "files", "scheduled_messages"]) expect(tables).not.toContain(keep);
  });

  it("keeps rate-limit records longer than the limits look back", () => {
    const rule = RETENTION.find((r) => r.table === "public_request_log")!;
    expect(rule.days).toBeGreaterThanOrEqual(1);
    expect(retentionCutoff(rule, new Date("2026-10-03T00:00:00Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});
