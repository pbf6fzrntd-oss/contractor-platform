/**
 * Reads a prospect's website HTML and notes what customers and AI assistants
 * can find on it. Pure function: text in, findings out (the fetching lives in
 * lib/audit/fetch.ts). Heuristics, not guarantees: the founder confirms on the call.
 */

export type WebsiteFindings = {
  reachable: boolean;
  https: boolean;
  finalUrl: string | null;
  title: string | null;
  mobileViewport: boolean;
  /** schema.org types found in JSON-LD blocks (e.g. ["RoofingContractor"]). */
  schemaTypes: string[];
  schemaHasPhone: boolean;
  schemaHasHours: boolean;
  schemaHasAddressOrArea: boolean;
  phoneOnPage: boolean;
  clickToCall: boolean;
  hoursOnPage: boolean;
  bookingLink: boolean;
  prices: boolean;
  serviceArea: boolean;
  licenseMention: boolean;
  insuredMention: boolean;
  reviewsMention: boolean;
  emergencyMention: boolean;
  photoCount: number;
  /** AI crawlers blocked in robots.txt (null = robots.txt not checked). */
  aiCrawlersBlocked: string[] | null;
  llmsTxt: boolean | null;
};

export const EMPTY_FINDINGS: WebsiteFindings = {
  reachable: false,
  https: false,
  finalUrl: null,
  title: null,
  mobileViewport: false,
  schemaTypes: [],
  schemaHasPhone: false,
  schemaHasHours: false,
  schemaHasAddressOrArea: false,
  phoneOnPage: false,
  clickToCall: false,
  hoursOnPage: false,
  bookingLink: false,
  prices: false,
  serviceArea: false,
  licenseMention: false,
  insuredMention: false,
  reviewsMention: false,
  emergencyMention: false,
  photoCount: 0,
  aiCrawlersBlocked: null,
  llmsTxt: null,
};

/** Local place names we look for when checking the service area. */
const LOCAL_PLACES = [
  "charleston", "summerville", "mount pleasant", "mt. pleasant", "mt pleasant", "goose creek", "hanahan", "ladson",
  "moncks corner", "west ashley", "james island", "johns island", "daniel island", "folly beach", "isle of palms",
  "north charleston", "ravenel", "nexton", "lowcountry", "berkeley county", "dorchester county", "kiawah", "wando",
];

/** AI crawlers owners should usually let in so assistants can learn about them. */
export const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Applebot-Extended"];

function collectTypes(node: unknown, out: { types: Set<string>; phone: boolean; hours: boolean; area: boolean }) {
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  for (const type of Array.isArray(t) ? t : [t]) if (typeof type === "string") out.types.add(type.replace(/^https?:\/\/schema\.org\//, ""));
  if (obj.telephone) out.phone = true;
  if (obj.openingHours || obj.openingHoursSpecification) out.hours = true;
  if (obj.address || obj.areaServed || obj.serviceArea) out.area = true;
  for (const [k, v] of Object.entries(obj)) if (k !== "@context" && typeof v === "object") collectTypes(v, out);
}

/** Text of the page without tags, scripts and styles, lowercased. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function analyzeHtml(html: string, finalUrl: string): WebsiteFindings {
  const text = visibleText(html);
  const jsonLd = { types: new Set<string>(), phone: false, hours: false, area: false };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectTypes(JSON.parse(m[1].trim()), jsonLd);
    } catch {
      /* broken JSON-LD counts as none */
    }
  }
  const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => m[0].toLowerCase());
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, " ").trim() ?? null;

  return {
    ...EMPTY_FINDINGS,
    reachable: true,
    https: finalUrl.startsWith("https://"),
    finalUrl,
    title: title ? title.slice(0, 200) : null,
    mobileViewport: /<meta[^>]+name=["']viewport["'][^>]*width=device-width/i.test(html),
    schemaTypes: [...jsonLd.types].slice(0, 20),
    schemaHasPhone: jsonLd.phone,
    schemaHasHours: jsonLd.hours,
    schemaHasAddressOrArea: jsonLd.area,
    phoneOnPage: /\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/.test(text),
    clickToCall: /href=["']tel:/i.test(html),
    hoursOnPage: jsonLd.hours || /\b(mon(day)?|tue(sday)?|weekdays)\b[^.]{0,40}\b\d{1,2}(:\d{2})?\s?(am|a\.m\.)/i.test(text) || /\bhours\b/.test(text),
    bookingLink: links.some((l) => /\b(book|schedule|appointment|reserve|request (a )?(quote|estimate|service))\b/.test(l)),
    prices: /\$\s?\d{2,}/.test(text) || /\bstarting (at|from)\b/.test(text),
    serviceArea: /\bservice area|areas? (we )?serve|serving\b/.test(text) || LOCAL_PLACES.some((p) => text.includes(p)),
    licenseMention: /\blicen[cs]ed\b|\blicen[cs]e\s?(#|no\.?|number)/.test(text),
    insuredMention: /\binsured\b|\binsurance\b/.test(text),
    reviewsMention: /\breviews?\b|\btestimonials?\b|★|\bstars?\b/.test(text),
    emergencyMention: /\b24\/7\b|\b24 hours?\b|\bemergency\b|\bafter[- ]hours\b/.test(text),
    photoCount: (html.match(/<img\b/gi) ?? []).length,
  };
}

/** Which AI crawlers robots.txt blocks from the whole site. */
export function blockedAiCrawlers(robotsTxt: string): string[] {
  const groups: { agents: string[]; disallowAll: boolean }[] = [];
  let current: { agents: string[]; disallowAll: boolean } | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = m;
    if (field.toLowerCase() === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && field.toLowerCase() === "disallow" && value.trim() === "/") current.disallowAll = true;
    }
  }
  return AI_CRAWLERS.filter((bot) => {
    const specific = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    const group = specific ?? groups.find((g) => g.agents.includes("*"));
    return Boolean(group?.disallowAll);
  });
}
