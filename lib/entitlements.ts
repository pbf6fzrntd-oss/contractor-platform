import type { Tables } from "@/lib/database.types";

/**
 * What a business's plan allows. Every feature/limit check goes through here,
 * so adding Stripe later only changes which plan a business is on.
 */
export type Plan = Pick<
  Tables<"plans">,
  | "id"
  | "max_users"
  | "max_phone_numbers"
  | "monthly_sms_limit"
  | "feature_recurring_customers"
  | "feature_bulk_messaging"
  | "feature_campaigns"
  | "feature_team_ai"
  | "feature_agent_ready"
  | "feature_booking"
  | "feature_approvals"
  | "feature_ai_voice"
>;

export const PLAN_FEATURES = ["recurring_customers", "bulk_messaging", "campaigns", "team_ai", "agent_ready", "booking", "approvals", "ai_voice"] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export function hasFeature(plan: Plan, feature: PlanFeature): boolean {
  switch (feature) {
    case "recurring_customers":
      return plan.feature_recurring_customers;
    case "bulk_messaging":
      return plan.feature_bulk_messaging;
    case "campaigns":
      return plan.feature_campaigns;
    case "team_ai":
      // Office managers connecting their own AI tools (Executive tier).
      return plan.feature_team_ai;
    case "agent_ready":
      return plan.feature_agent_ready;
    case "booking":
      return plan.feature_booking;
    case "approvals":
      return plan.feature_approvals;
    case "ai_voice":
      return plan.feature_ai_voice;
  }
}

/** Plan switches an add-on unlocks (e.g. Agent Ready on the Pro plan). */
export const ADDON_GRANTS: Partial<Record<string, PlanFeature[]>> = {
  agent_ready: ["agent_ready", "booking", "approvals"],
};

/**
 * Can this business use a feature? Its plan includes it, or it bought an
 * add-on that unlocks it. `modules` are its enabled org_modules keys.
 */
export function canUse(plan: Plan, modules: readonly string[], feature: PlanFeature): boolean {
  return hasFeature(plan, feature) || modules.some((m) => ADDON_GRANTS[m]?.includes(feature));
}

/** Booking is on when the business has it (plan or add-on) AND the owner switched it on. */
export function bookingOn(org: { booking_enabled: boolean }, plan: Plan, modules: readonly string[]): boolean {
  return org.booking_enabled && canUse(plan, modules, "booking");
}

export function canAddUser(plan: Plan, currentUserCount: number): boolean {
  return currentUserCount < plan.max_users;
}

/**
 * Is the business's account in good standing? "manual" = billed by hand
 * (pilots). past_due still works (grace period while Stripe retries the card).
 */
export function isBillingActive(status: string | null | undefined): boolean {
  return status === "manual" || status === "active" || status === "trialing" || status === "past_due";
}
