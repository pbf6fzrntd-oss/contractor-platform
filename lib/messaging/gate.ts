import { isBillingActive } from "@/lib/entitlements";

/**
 * Business-level checks before any text goes out (the per-customer checks
 * live in lib/automation/compliance.ts).
 */
export type GateInput = {
  hasPhoneNumber: boolean;
  /** Simulator, carrier registration approved, or explicitly allowed for testing. */
  textingApproved: boolean;
  subscriptionStatus: string | null;
  monthlyLimit: number;
  sentThisMonth: number;
};

export type GateBlock = "no_business_number" | "texting_not_approved" | "billing_inactive" | "monthly_limit_reached";

export function checkSendingGate(input: GateInput): GateBlock | null {
  if (!input.hasPhoneNumber) return "no_business_number";
  if (!input.textingApproved) return "texting_not_approved";
  if (!isBillingActive(input.subscriptionStatus)) return "billing_inactive";
  if (input.sentThisMonth >= input.monthlyLimit) return "monthly_limit_reached";
  return null;
}

export type BlockReason =
  | GateBlock
  | "opted_out"
  | "no_marketing_consent"
  | "outside_marketing_hours"
  | "provider_error";

/** Plain-English explanation shown in the inbox next to a text that wasn't sent. */
export const BLOCK_REASON_TEXT: Record<BlockReason, string> = {
  no_business_number: "Not sent: set up your business phone number first (Settings → Phone number).",
  texting_not_approved: "Not sent: texting turns on once carrier registration is approved.",
  billing_inactive: "Not sent: your subscription isn't active (Settings → Billing).",
  monthly_limit_reached: "Not sent: you've used this month's texts on your plan.",
  opted_out: "Not sent: this customer opted out of texts.",
  no_marketing_consent: "Not sent: no marketing consent on file for this customer.",
  outside_marketing_hours: "Not sent: promotions can only go out 8am–8pm.",
  provider_error: "Not sent: the phone company returned an error.",
};
