import { getIndustry, type IndustryConfig } from "@/lib/industries";
import { SCHEMA_ORG_PARENTS } from "@/lib/industries/schema-org";
import type { AuditCheck } from "@/lib/industries/types";
import type { WebsiteFindings } from "@/lib/audit/website";

/**
 * The agent-readiness audit (founder's sales tool). Scores how easy it is for
 * customers AND AI assistants (ChatGPT, Claude, Google, Siri) to find, trust,
 * reach and book a business. Pure functions: findings + call answers in, report out.
 */

export type CheckStatus = "pass" | "fail" | "unknown";

/** Questions the founder asks on the sales call. */
export const CALL_QUESTIONS = [
  { key: "answers_after_hours", label: "Missed and after-hours calls get a response (not just voicemail)", why: "Most people call the next business on the list if nobody answers. AI assistants that call on a customer's behalf do the same.", weight: 3, fixedBy: "Missed-call text-back (and the AI voice line later)" },
  { key: "fast_reply", label: "New inquiries get a reply within 5 minutes", why: "The first business to reply usually wins the job.", weight: 3, fixedBy: "Instant text-back and the shared lead inbox" },
  { key: "follow_up", label: "Every estimate or quote gets followed up", why: "Many jobs are lost only because nobody followed up.", weight: 2, fixedBy: "Automatic estimate follow-ups" },
  { key: "google_profile", label: "Google Business Profile is complete (hours, photos, services)", why: "Google and AI assistants pull hours, photos and services from it.", weight: 3, fixedBy: "Setup help + your hosted profile" },
  { key: "reviews", label: "25+ Google reviews averaging 4.5 stars or more", why: "Assistants and customers both favor well-reviewed businesses.", weight: 2, fixedBy: "Automatic review requests" },
  { key: "texting", label: "Customers can text the business number", why: "Most customers prefer texting, and AI agents send texts too.", weight: 2, fixedBy: "Two-way texting on your business number" },
] as const;

export type CallAnswers = Partial<Record<string, CheckStatus>>;

export type AuditItem = {
  key: string;
  label: string;
  why: string;
  weight: number;
  status: CheckStatus;
  /** "website" (checked automatically) or "call" (the founder's answer). */
  source: "website" | "call";
  /** Evidence we found, in plain words. */
  detail?: string;
  /** What in our product fixes it. */
  fixedBy?: string;
};

export type AuditReport = {
  industry: string | null;
  industryLabel: string;
  score: number;
  grade: "Ready" | "Getting there" | "Invisible to AI";
  items: AuditItem[];
  /** Top failed checks by weight, for the "what we'd fix first" section. */
  topFixes: AuditItem[];
};

const s = (ok: boolean): CheckStatus => (ok ? "pass" : "fail");

/** Is `type` the industry's type, or a more specific type under it? */
export function schemaMatchesIndustry(types: string[], industry: IndustryConfig | undefined): boolean {
  if (!industry) return types.some((t) => t in SCHEMA_ORG_PARENTS || t === "LocalBusiness");
  const wanted = industry.schemaOrg.type;
  return types.some((t) => {
    for (let cur: string | undefined = t; cur; cur = SCHEMA_ORG_PARENTS[cur]) if (cur === wanted) return true;
    return false;
  });
}

function websiteItems(f: WebsiteFindings, industry: IndustryConfig | undefined): AuditItem[] {
  const w = (key: string, label: string, why: string, weight: number, status: CheckStatus, detail?: string, fixedBy?: string): AuditItem => ({
    key, label, why, weight, status: f.reachable ? status : "fail", source: "website", detail, fixedBy,
  });
  const business = f.schemaTypes.filter((t) => t in SCHEMA_ORG_PARENTS || t === "LocalBusiness");
  return [
    w("website", "Website loads", "If the site doesn't load, assistants can't learn anything about the business.", 3, s(f.reachable), f.finalUrl ?? undefined, "Your hosted profile page"),
    w("https", "Website is secure (https)", "Browsers and assistants warn people away from insecure sites.", 2, s(f.https), undefined, "Your hosted profile page"),
    w("mobile", "Works on phones", "Most customers search from a phone.", 2, s(f.mobileViewport), undefined, "Your hosted profile page"),
    w("structured_data", "Business details in machine-readable form (schema.org)", "This is how AI assistants reliably read your name, services, hours and area.", 3, s(business.length > 0), business.length ? `Found: ${business.join(", ")}` : f.schemaTypes.length ? `Only generic types: ${f.schemaTypes.slice(0, 4).join(", ")}` : "None found", "Hosted profile with structured data"),
    w("specific_type", `Uses the right business type${industry ? ` (${industry.schemaOrg.type})` : ""}`, "The more specific the type, the better assistants match you to the right searches.", 1, s(schemaMatchesIndustry(f.schemaTypes, industry)), undefined, "Hosted profile with structured data"),
    w("phone", "Phone number is tap-to-call", "Customers on phones and AI assistants need a number they can use right away.", 2, s(f.clickToCall || f.schemaHasPhone), f.clickToCall ? "Tap-to-call link found" : f.phoneOnPage ? "Number shown, but not tap-to-call" : undefined, "Hosted profile"),
    w("hours", "Hours are listed", "Assistants answer 'who's open now?' from listed hours.", 2, s(f.schemaHasHours || f.hoursOnPage), undefined, "Hosted profile"),
    w("ai_crawlers", "AI assistants are allowed to read the site", "Some sites accidentally block ChatGPT, Claude or Perplexity from reading them.", 2, f.aiCrawlersBlocked === null ? "unknown" : s(f.aiCrawlersBlocked.length === 0), f.aiCrawlersBlocked?.length ? `Blocked: ${f.aiCrawlersBlocked.join(", ")}` : undefined),
    w("llms_txt", "Has an AI-friendly summary file (llms.txt)", "A new, optional file that gives AI assistants a clean summary of the business.", 1, f.llmsTxt === null ? "unknown" : s(f.llmsTxt), undefined, "Hosted profile (includes one)"),
    w("reviews_shown", "Reviews or testimonials on the site", "Social proof on the page helps both people and assistants trust you.", 1, s(f.reviewsMention)),
  ];
}

/** Detects an industry check from the website where we can; otherwise it's asked on the call. */
function industryItem(check: AuditCheck, f: WebsiteFindings, answers: CallAnswers): AuditItem {
  const detectors: Partial<Record<string, () => boolean>> = {
    license_visible: () => f.licenseMention && f.insuredMention,
    bonded_insured: () => f.insuredMention,
    insured_statement: () => f.insuredMention,
    price_ranges: () => f.prices,
    upfront_pricing: () => f.prices,
    size_pricing: () => f.prices,
    service_area: () => f.serviceArea || f.schemaHasAddressOrArea,
    book_online: () => f.bookingLink,
    project_photos: () => f.photoCount >= 6,
    facility_photos: () => f.photoCount >= 6,
    emergency_service: () => f.emergencyMention,
  };
  const fixedBy: Partial<Record<string, string>> = {
    license_visible: "Licenses & insurance on your hosted profile",
    price_ranges: "Price ranges on your hosted profile",
    service_area: "Service area on your hosted profile",
    book_online: "Online booking page (and AI-agent booking)",
    policies: "Policies on your hosted profile",
  };
  const answered = answers[check.key];
  const detect = detectors[check.key];
  const status: CheckStatus = answered && answered !== "unknown" ? answered : detect && f.reachable ? s(detect()) : "unknown";
  return { ...check, status, source: answered && answered !== "unknown" ? "call" : detect ? "website" : "call", fixedBy: fixedBy[check.key] };
}

export function buildAuditReport(input: { industry: string | null; findings: WebsiteFindings; answers: CallAnswers }): AuditReport {
  const industry = getIndustry(input.industry);
  const items: AuditItem[] = [...websiteItems(input.findings, industry)];
  for (const q of CALL_QUESTIONS) items.push({ ...q, status: input.answers[q.key] ?? "unknown", source: "call" });
  for (const check of industry?.auditChecks ?? []) {
    if (items.some((i) => i.key === check.key)) continue;
    items.push(industryItem(check, input.findings, input.answers));
  }
  const known = items.filter((i) => i.status !== "unknown");
  const possible = known.reduce((n, i) => n + i.weight, 0);
  const earned = known.filter((i) => i.status === "pass").reduce((n, i) => n + i.weight, 0);
  const score = possible ? Math.round((earned / possible) * 100) : 0;
  return {
    industry: industry?.key ?? null,
    industryLabel: industry?.label ?? "Local business",
    score,
    grade: score >= 80 ? "Ready" : score >= 50 ? "Getting there" : "Invisible to AI",
    items,
    topFixes: items
      .filter((i) => i.status === "fail")
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5),
  };
}
