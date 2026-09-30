import { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { BookingSource } from "@/lib/booking/types";
import type { ModuleId } from "@/lib/industries/types";

/**
 * Approval rules: when a booking or request should wait for the owner's OK
 * instead of being confirmed right away. Pure functions: facts in, decision out.
 * The same rules apply to the booking page, outside AI agents and the voice line.
 */

export const APPROVAL_RULE_KEYS = [
  "outside_channels",
  "own_assistant",
  "new_customer",
  "price_over",
  "short_notice",
  "outside_service_area",
  // Module rules (used once those modules ship; tested now):
  "aggressive_pet",
  "vaccine_problem",
  "move_distance_over",
  "repair_estimate_over",
  "quote_over",
] as const;
export type ApprovalRuleKey = (typeof APPROVAL_RULE_KEYS)[number];

export type ApprovalRuleInfo = {
  key: ApprovalRuleKey;
  label: string;
  /** Which modules show this rule in Settings (undefined = every business). */
  modules?: ModuleId[];
  /** Label of the number setting, if the rule has one. */
  valueLabel?: string;
};

export const APPROVAL_RULES: ApprovalRuleInfo[] = [
  { key: "outside_channels", label: "Bookings made online, by a customer's AI agent, or by phone assistant" },
  { key: "own_assistant", label: "Bookings made by your own AI assistant" },
  { key: "new_customer", label: "First booking from a new customer" },
  { key: "price_over", label: "Services priced over", valueLabel: "Dollars" },
  { key: "short_notice", label: "Bookings less than this many hours away", valueLabel: "Hours" },
  { key: "outside_service_area", label: "Addresses outside your service ZIP codes" },
  { key: "aggressive_pet", label: "Pets with a behavior warning", modules: ["pet_care"] },
  { key: "vaccine_problem", label: "Pets whose vaccine records are missing or expiring", modules: ["pet_care"] },
  { key: "move_distance_over", label: "Moves longer than", valueLabel: "Miles", modules: ["project_quote"] },
  { key: "repair_estimate_over", label: "Repairs estimated over", valueLabel: "Dollars", modules: ["automotive"] },
  { key: "quote_over", label: "Quotes over", valueLabel: "Dollars", modules: ["project_quote", "automotive"] },
];

const ruleSchema = z.object({ on: z.boolean(), value: z.number().min(0).max(10_000_000).optional() });
const settingsSchema = z.object(
  Object.fromEntries(APPROVAL_RULE_KEYS.map((k) => [k, ruleSchema.optional()])) as Record<ApprovalRuleKey, z.ZodOptional<typeof ruleSchema>>,
);
export type ApprovalSettings = Record<ApprovalRuleKey, { on: boolean; value?: number }>;

/**
 * Defaults: anything booked from OUTSIDE the business (online, a customer's AI
 * agent, the phone assistant) waits for the owner's OK until they change it.
 * Pet safety rules are on by default. Everything else is off.
 */
export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  outside_channels: { on: true },
  own_assistant: { on: false },
  new_customer: { on: false },
  price_over: { on: false, value: 1000 },
  short_notice: { on: false, value: 24 },
  outside_service_area: { on: true },
  aggressive_pet: { on: true },
  vaccine_problem: { on: true },
  move_distance_over: { on: false, value: 50 },
  repair_estimate_over: { on: false, value: 1000 },
  quote_over: { on: false, value: 5000 },
};

export function parseApprovalSettings(value: Json | null | undefined): ApprovalSettings {
  const parsed = settingsSchema.safeParse(value ?? {});
  const saved = parsed.success ? parsed.data : {};
  return Object.fromEntries(APPROVAL_RULE_KEYS.map((k) => [k, { ...DEFAULT_APPROVAL_SETTINGS[k], ...(saved[k] ?? {}) }])) as ApprovalSettings;
}

/** What we know about a booking or request when deciding. Unknown facts never trigger a rule. */
export type ApprovalFacts = {
  source: BookingSource;
  isNewCustomer?: boolean;
  priceCents?: number | null;
  hoursUntilStart?: number | null;
  zip?: string | null;
  serviceZips?: string[];
  petBehaviorWarning?: boolean;
  /** "ok" | "missing" | "expiring" for required vaccine records. */
  vaccineStatus?: "ok" | "missing" | "expiring" | null;
  moveDistanceMiles?: number | null;
  repairEstimateCents?: number | null;
  quoteCents?: number | null;
};

export type ApprovalDecision = { needsApproval: boolean; reasons: string[] };

const OUTSIDE: BookingSource[] = ["customer_link", "outside_agent", "voice"];
const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export function evaluateApproval(settings: ApprovalSettings, f: ApprovalFacts): ApprovalDecision {
  const reasons: string[] = [];
  const on = (k: ApprovalRuleKey) => settings[k].on;
  const value = (k: ApprovalRuleKey) => settings[k].value ?? DEFAULT_APPROVAL_SETTINGS[k].value ?? 0;
  // Bookings the owner or team make themselves never need their own approval.
  if (f.source === "owner" || f.source === "team") return { needsApproval: false, reasons };

  if (on("outside_channels") && OUTSIDE.includes(f.source)) {
    reasons.push(f.source === "outside_agent" ? "Booked by a customer's AI agent" : f.source === "voice" ? "Booked by the phone assistant" : "Booked online");
  }
  if (on("own_assistant") && f.source === "ai_assistant") reasons.push("Booked by your AI assistant");
  if (on("new_customer") && f.isNewCustomer) reasons.push("New customer");
  if (on("price_over") && f.priceCents != null && f.priceCents > value("price_over") * 100) reasons.push(`Priced over ${dollars(value("price_over") * 100)}`);
  if (on("short_notice") && f.hoursUntilStart != null && f.hoursUntilStart < value("short_notice")) reasons.push(`Less than ${value("short_notice")} hours away`);
  if (on("outside_service_area") && f.zip && f.serviceZips?.length && !f.serviceZips.includes(f.zip)) reasons.push(`Outside your service area (${f.zip})`);
  if (on("aggressive_pet") && f.petBehaviorWarning) reasons.push("Pet has a behavior warning");
  if (on("vaccine_problem") && (f.vaccineStatus === "missing" || f.vaccineStatus === "expiring")) {
    reasons.push(f.vaccineStatus === "missing" ? "Vaccine records missing" : "Vaccines expire before the visit ends");
  }
  if (on("move_distance_over") && f.moveDistanceMiles != null && f.moveDistanceMiles > value("move_distance_over")) reasons.push(`Move over ${value("move_distance_over")} miles`);
  if (on("repair_estimate_over") && f.repairEstimateCents != null && f.repairEstimateCents > value("repair_estimate_over") * 100) {
    reasons.push(`Repair estimate over ${dollars(value("repair_estimate_over") * 100)}`);
  }
  if (on("quote_over") && f.quoteCents != null && f.quoteCents > value("quote_over") * 100) reasons.push(`Quote over ${dollars(value("quote_over") * 100)}`);
  return { needsApproval: reasons.length > 0, reasons };
}

/** Rules to show in Settings for a business with these modules. */
export function rulesFor(modules: string[]): ApprovalRuleInfo[] {
  return APPROVAL_RULES.filter((r) => !r.modules || r.modules.some((m) => modules.includes(m)));
}

/** Words that mean "this pet needs care" in behavior notes (private notes are never shown; only the flag is used). */
export function hasBehaviorWarning(notes: string | null | undefined): boolean {
  return /\b(bit|bites?|biting|aggress\w*|reactive|muzzle|snap\w*|growl\w*|attack\w*)\b/i.test(notes ?? "");
}
