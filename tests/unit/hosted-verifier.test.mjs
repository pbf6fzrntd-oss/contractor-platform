import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOrigin, verifyHosted } from "../../scripts/verify-hosted.mjs";

afterEach(() => vi.unstubAllGlobals());
describe("read-only hosted acceptance", () => {
  it.each(["http://example.com", "https://user:password@example.com", "https://example.com/dashboard", "https://example.com/?secret=x"])("refuses unsafe origin %s", input => {
    expect(() => validateOrigin(input)).toThrow();
  });
  it("accepts ready HTTPS while making no authenticated or mutating application requests", async () => {
    const fetcher = vi.fn(async (input, options) => {
      const path = new URL(input).pathname;
      expect(options.redirect).toBe("manual");
      expect(options.headers).toBeUndefined();
      if (path === "/api/health") return Response.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
      if (path === "/login") return new Response("login", { headers: { "x-content-type-options": "nosniff", "x-frame-options": "DENY" } });
      if (path === "/api/cron/dispatch") return new Response(null, { status: 401 });
      return new Response(null, { status: 307, headers: { location: "/login" } });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await verifyHosted("https://example.com")).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls.some(([input]) => new URL(input).pathname === "/demo")).toBe(false);
  });
  it("fails unavailable health, public dashboards, cross-site redirects and open scheduler", async () => {
    vi.stubGlobal("fetch", async input => {
      const path = new URL(input).pathname;
      if (path === "/api/health") return Response.json({ status: "unavailable" }, { status: 503 });
      if (path === "/settings") return new Response(null, { status: 307, headers: { location: "https://other.example/login" } });
      return new Response("unexpected public page");
    });
    expect(await verifyHosted("https://example.com")).toHaveLength(8);
  });
});
