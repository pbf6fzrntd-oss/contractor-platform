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
>;

export const PLAN_FEATURES = ["recurring_customers", "bulk_messaging", "campaigns"] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export function hasFeature(plan: Plan, feature: PlanFeature): boolean {
  switch (feature) {
    case "recurring_customers":
      return plan.feature_recurring_customers;
    case "bulk_messaging":
      return plan.feature_bulk_messaging;
    case "campaigns":
      return plan.feature_campaigns;
  }
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
