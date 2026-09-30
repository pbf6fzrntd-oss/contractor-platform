import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress, normalizeWebsiteUrl } from "@/lib/audit/url";
import { analyzeHtml, blockedAiCrawlers, EMPTY_FINDINGS, type WebsiteFindings } from "@/lib/audit/website";

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

/** Only for local testing against a site on this computer; never honored in production. */
const allowPrivate = () => process.env.NODE_ENV !== "production" && process.env.AUDIT_ALLOW_PRIVATE_HOSTS === "1";

async function assertPublic(url: string): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (allowPrivate()) return;
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("not a public address");
}

async function readLimited(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
}

/** Fetches a public page, re-checking every redirect so it can't be bounced to a private address. */
async function safeGet(start: string): Promise<{ url: string; status: number; body: string } | null> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = normalizeWebsiteUrl(url);
    if (!safe) return null;
    await assertPublic(safe);
    const res = await fetch(safe, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; AgentReadinessAudit/1.0)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, safe).toString();
      await res.body?.cancel().catch(() => {});
      continue;
    }
    return { url: safe, status: res.status, body: await readLimited(res) };
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
