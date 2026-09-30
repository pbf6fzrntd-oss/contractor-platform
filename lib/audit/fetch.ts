import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isPrivateAddress, normalizeWebsiteUrl } from "@/lib/audit/url";
import { analyzeHtml, blockedAiCrawlers, EMPTY_FINDINGS, type WebsiteFindings } from "@/lib/audit/website";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

/** Only for local testing against a site on this computer; never honored in production. */
const allowPrivate = () => process.env.NODE_ENV !== "production" && process.env.AUDIT_ALLOW_PRIVATE_HOSTS === "1";

/** Resolve once, validate every answer, and pin the connection to a checked IP. */
async function pinnedGet(url: string): Promise<{ status: number; location?: string; body: string }> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || (!allowPrivate() && addresses.some((a) => isPrivateAddress(a.address)))) throw new Error("not a public address");
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = (parsed.protocol === "https:" ? httpsRequest : httpRequest)(parsed, {
      agent: false,
      // Host and TLS certificate verification retain the original hostname.
      lookup: (_host, options, done) => {
        if (options.all) done(null, [address]);
        else done(null, address.address, address.family);
      },
      headers: { "user-agent": "Mozilla/5.0 (compatible; AgentReadinessAudit/1.0)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
    }, (res) => {
      const status = res.statusCode ?? 500;
      if (status >= 300 && status < 400 && res.headers.location) {
        resolve({ status, location: res.headers.location, body: "" });
        res.destroy();
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { req.destroy(new Error("response too large")); return; }
        chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const timer = setTimeout(() => req.destroy(new Error("request timed out")), TIMEOUT_MS);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
}

/** Fetches a public page, re-checking every redirect so it can't be bounced to a private address. */
async function safeGet(start: string): Promise<{ url: string; status: number; body: string } | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = normalizeWebsiteUrl(url);
    if (!safe) return null;
    const res = await pinnedGet(safe);
    if (res.location) {
      url = new URL(res.location, safe).toString();
      continue;
    }
    return { url: safe, status: res.status, body: res.body };
  }
  return null;
}

/** Visits the prospect's website (home page, robots.txt, llms.txt) and returns what we found. */
export async function auditWebsite(input: string): Promise<{ findings: WebsiteFindings; error?: string }> {
  const start = normalizeWebsiteUrl(input);
  if (!start) return { findings: EMPTY_FINDINGS, error: "That doesn't look like a public website address." };
  try {
    const page = await safeGet(start);
    if (!page || page.status >= 400) return { findings: EMPTY_FINDINGS, error: `The website didn't load${page ? ` (error ${page.status})` : ""}.` };
    const findings = analyzeHtml(page.body, page.url);
    const origin = new URL(page.url).origin;
    const [robots, llms] = await Promise.all([
      safeGet(`${origin}/robots.txt`).catch(() => null),
      safeGet(`${origin}/llms.txt`).catch(() => null),
    ]);
    return {
      findings: {
        ...findings,
        aiCrawlersBlocked: robots && robots.status < 400 ? blockedAiCrawlers(robots.body) : robots ? [] : null,
        llmsTxt: llms ? llms.status === 200 && !/<html/i.test(llms.body.slice(0, 500)) && llms.body.trim().length > 20 : null,
      },
    };
  } catch (e) {
    const reason = e instanceof Error && e.message === "not a public address" ? "That address points to a private network." : "The website didn't respond in time.";
    return { findings: EMPTY_FINDINGS, error: reason };
  }
}
