/**
 * Plain rules for turning Stripe's subscription info into ours.
 * Stripe is the source of truth for payments; we keep a copy in `subscriptions`.
 */

export type OurStatus = "manual" | "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "incomplete";

export function mapStripeStatus(status: string): OurStatus {
  switch (status) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "unpaid";
    default:
      return "incomplete";
  }
}

/** Which of our plans a Stripe price belongs to. */
export function planForPrice(plans: { id: string; stripe_price_id: string | null }[], priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  return plans.find((p) => p.stripe_price_id === priceId)?.id ?? null;
}

export const STATUS_TEXT: Record<OurStatus, string> = {
  manual: "Billed by invoice",
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed. Stripe is retrying your card",
  canceled: "Canceled",
  unpaid: "Unpaid",
  incomplete: "Waiting for payment",
};
