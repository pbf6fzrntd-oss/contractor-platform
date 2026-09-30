import { describe, expect, it } from "vitest";
import { buildAuditReport, CALL_QUESTIONS, schemaMatchesIndustry } from "@/lib/audit/checks";
import { isPrivateAddress, normalizeWebsiteUrl } from "@/lib/audit/url";
import { analyzeHtml, blockedAiCrawlers, EMPTY_FINDINGS } from "@/lib/audit/website";
import { getIndustry, INDUSTRIES } from "@/lib/industries";

const GOOD_SITE = `<!doctype html><html><head>
<title>Top Roof | Summerville Roofing</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"RoofingContractor","name":"Top Roof","telephone":"+18435550100",
"openingHours":"Mo-Fr 07:00-18:00","areaServed":["Summerville","Charleston"]}</script>
</head><body>
<a href="tel:+18435550100">(843) 555-0100</a> <a href="/book">Book an inspection</a>
<p>Licensed and insured. License # 12345. Roof repairs starting at $350. Serving Summerville, Goose Creek and Mount Pleasant.</p>
<p>24/7 emergency tarping. Read our 5-star reviews.</p>
${'<img src="a.jpg">'.repeat(8)}
</body></html>`;

const BARE_SITE = `<html><head><title>Joe's</title></head><body><p>Call Joe 843-555-0199</p></body></html>`;

describe("reading a prospect's website", () => {
  it("finds what customers and AI assistants need on a good site", () => {
    const f = analyzeHtml(GOOD_SITE, "https://toproof.test/");
    expect(f).toMatchObject({
      https: true,
      mobileViewport: true,
      schemaTypes: ["RoofingContractor"],
      schemaHasPhone: true,
      schemaHasHours: true,
      clickToCall: true,
      bookingLink: true,
      prices: true,
      serviceArea: true,
      licenseMention: true,
      insuredMention: true,
      emergencyMention: true,
      reviewsMention: true,
      photoCount: 8,
    });
  });

  it("notices what a bare site is missing", () => {
    const f = analyzeHtml(BARE_SITE, "http://joes.test/");
    expect(f).toMatchObject({ https: false, mobileViewport: false, schemaTypes: [], clickToCall: false, bookingLink: false, prices: false, licenseMention: false });
    expect(f.phoneOnPage).toBe(true);
  });

  it("ignores broken structured data instead of failing", () => {
    const f = analyzeHtml(`<script type="application/ld+json">{not json</script>`, "https://x.test/");
    expect(f.schemaTypes).toEqual([]);
  });

  it("finds business types nested in @graph", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":["LocalBusiness","HVACBusiness"]}]}</script>`;
    expect(analyzeHtml(html, "https://x.test/").schemaTypes).toEqual(["WebSite", "LocalBusiness", "HVACBusiness"]);
  });
});

describe("robots.txt and AI crawlers", () => {
  it("spots AI crawlers blocked by name or by a site-wide block", () => {
    expect(blockedAiCrawlers("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /")).toEqual(["GPTBot"]);
    expect(blockedAiCrawlers("User-agent: *\nDisallow: /")).toContain("ClaudeBot");
    expect(blockedAiCrawlers("User-agent: *\nDisallow: /admin")).toEqual([]);
    expect(blockedAiCrawlers("User-agent: ClaudeBot\nAllow: /\nUser-agent: *\nDisallow: /")).not.toContain("ClaudeBot");
  });

  it("treats grouped user-agents as one rule", () => {
    expect(blockedAiCrawlers("User-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /")).toEqual(["GPTBot", "PerplexityBot"]);
  });
});

describe("which websites the audit may visit (no private networks)", () => {
  it("normalizes typed addresses", () => {
    expect(normalizeWebsiteUrl("roofco.com")).toBe("https://roofco.com/");
    expect(normalizeWebsiteUrl("http://roofco.com/about#x")).toBe("http://roofco.com/about");
  });

  it.each(["localhost", "http://localhost:3000", "ftp://x.com", "https://user:pw@x.com", "https://x.com:8443", "intranet", "file:///etc/passwd", "printer.local", "metadata.google.internal"])(
    "refuses %s",
    (input) => expect(normalizeWebsiteUrl(input)).toBeNull(),
  );

  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a00:1", "::7f00:1", "2002:7f00:1::", "2001:db8::1", "nonsense"])(
    "treats %s as private",
    (ip) => expect(isPrivateAddress(ip)).toBe(true),
  );

  it.each(["8.8.8.8", "104.16.0.1", "2606:4700::1111"])("treats %s as public", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("scoring the audit", () => {
  const allYes = Object.fromEntries(CALL_QUESTIONS.map((q) => [q.key, "pass" as const]));

  it("scores a strong roofer high and a bare site low", () => {
    const good = buildAuditReport({ industry: "roofing", findings: { ...analyzeHtml(GOOD_SITE, "https://toproof.test/"), aiCrawlersBlocked: [], llmsTxt: true }, answers: allYes });
    expect(good.score).toBeGreaterThanOrEqual(80);
    expect(good.grade).toBe("Ready");
    const bare = buildAuditReport({ industry: "roofing", findings: analyzeHtml(BARE_SITE, "http://joes.test/"), answers: {} });
    expect(bare.score).toBeLessThan(50);
    expect(bare.grade).toBe("Invisible to AI");
    expect(bare.topFixes[0].weight).toBe(3);
    expect(bare.topFixes.every((i) => i.status === "fail")).toBe(true);
  });

  it("leaves unanswered questions out of the score instead of counting them as failures", () => {
    const f = { ...analyzeHtml(GOOD_SITE, "https://toproof.test/"), aiCrawlersBlocked: [], llmsTxt: true };
    const unanswered = buildAuditReport({ industry: "roofing", findings: f, answers: {} });
    expect(unanswered.items.filter((i) => i.status === "unknown").length).toBeGreaterThan(0);
    expect(unanswered.score).toBeGreaterThan(50);
  });

  it("fails every website check when the site doesn't load", () => {
    const r = buildAuditReport({ industry: "pest_control", findings: EMPTY_FINDINGS, answers: {} });
    expect(r.items.filter((i) => i.source === "website").every((i) => i.status === "fail" || i.status === "unknown")).toBe(true);
    expect(r.score).toBe(0);
  });

  it("works for every industry, even ones whose module isn't built yet", () => {
    for (const i of INDUSTRIES) {
      const r = buildAuditReport({ industry: i.key, findings: EMPTY_FINDINGS, answers: {} });
      expect(r.industryLabel).toBe(i.label);
      const keys = r.items.map((x) => x.key);
      expect(new Set(keys).size, i.key).toBe(keys.length);
      for (const check of i.auditChecks) expect(keys, `${i.key}.${check.key}`).toContain(check.key);
    }
  });

  it("lets the founder's answer override what the website check guessed", () => {
    const f = analyzeHtml(BARE_SITE, "http://joes.test/");
    const r = buildAuditReport({ industry: "roofing", findings: f, answers: { license_visible: "pass" } });
    expect(r.items.find((i) => i.key === "license_visible")).toMatchObject({ status: "pass", source: "call" });
  });

  it("accepts a more specific schema.org type under the industry's type", () => {
    expect(schemaMatchesIndustry(["RoofingContractor"], getIndustry("roofing"))).toBe(true);
    expect(schemaMatchesIndustry(["RoofingContractor"], getIndustry("gutters"))).toBe(true); // subtype of HomeAndConstructionBusiness
    expect(schemaMatchesIndustry(["Plumber"], getIndustry("roofing"))).toBe(false);
    expect(schemaMatchesIndustry(["AutoRepair"], getIndustry("auto_detailing"))).toBe(true);
    expect(schemaMatchesIndustry(["WebSite"], getIndustry("roofing"))).toBe(false);
  });
});
