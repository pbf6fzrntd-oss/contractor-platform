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

export type SubscriptionItemInfo = { itemId: string; priceId: string | null | undefined };

/**
 * A Stripe subscription can have several items: one plan plus add-ons (each
 * add-on is its own Stripe product). Works out which is which.
 */
export function classifyItems(
  items: SubscriptionItemInfo[],
  plans: { id: string; stripe_price_id: string | null }[],
  catalog: { key: string; stripe_price_id: string | null }[],
): { planId: string | null; addons: { key: string; itemId: string }[] } {
  let planId: string | null = null;
  const addons: { key: string; itemId: string }[] = [];
  for (const item of items) {
    const plan = planForPrice(plans, item.priceId);
    if (plan && !planId) {
      planId = plan;
      continue;
    }
    const addon = item.priceId ? catalog.find((c) => c.stripe_price_id === item.priceId) : undefined;
    if (addon && !addons.some((a) => a.key === addon.key)) addons.push({ key: addon.key, itemId: item.itemId });
  }
  return { planId, addons };
}

/** Subscription states in which paid add-ons stay on (past_due keeps working while Stripe retries). */
export function addonsActive(status: OurStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}

/**
 * Which paid add-ons to switch on or off. Only rows that came from billing
 * ("addon") are ever switched off here; editions, pilot and admin-granted
 * modules are left alone.
 */
export function addonChanges(
  current: { module: string; source: string; enabled: boolean }[],
  paid: string[],
  active: boolean,
): { enable: string[]; disable: string[] } {
  const want = active ? paid : [];
  const enable = want.filter((k) => !current.some((c) => c.module === k && c.enabled));
  const disable = current.filter((c) => c.source === "addon" && c.enabled && !want.includes(c.module)).map((c) => c.module);
  return { enable, disable };
}
