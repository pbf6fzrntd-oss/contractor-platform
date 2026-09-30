import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { addonsActive, classifyItems, mapStripeStatus } from "@/lib/billing/rules";
import type { AdminClient } from "@/lib/supabase/admin";

let client: Stripe | null = null;

/** Null until STRIPE_SECRET_KEY is set (pilots are invoiced by hand until then). */
export function getStripe(): Stripe | null {
  if (!serverEnv.stripeSecretKey) return null;
  client ??= new Stripe(serverEnv.stripeSecretKey);
  return client;
}

/** Copies a Stripe subscription into our tables and switches the business to the matching plan. */
export async function syncSubscription(db: AdminClient, sub: Stripe.Subscription, eventId: string, token: string): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let orgId = (sub.metadata?.org_id as string | undefined) ?? null;
  if (!orgId) {
    const { data, error } = await db.from("subscriptions").select("org_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (error) throw error;
    orgId = data?.org_id ?? null;
  }
  if (!orgId) throw new Error("Stripe subscription has no matching business");

  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  const status = mapStripeStatus(sub.status);
  const [planResult, catalogResult] = await Promise.all([
    db.from("plans").select("id, stripe_price_id"),
    db.from("addon_catalog").select("key, stripe_price_id"),
  ]);
  if (planResult.error) throw planResult.error;
  if (catalogResult.error) throw catalogResult.error;
  const { planId, addons } = classifyItems(
    sub.items.data.map((i) => ({ itemId: i.id, priceId: i.price?.id })),
    planResult.data ?? [],
    catalogResult.data ?? [],
  );
  const { data, error } = await db.rpc("apply_billing_snapshot", {
    p_event_id: eventId, p_token: token,
    p_snapshot: { org_id: orgId, subscription_id: sub.id, customer_id: customerId,
      status, period_end: periodEnd, plan_id: planId, addons, active: addonsActive(status) },
  });
  if (error || !data) throw error ?? new Error("Billing snapshot was not committed");
}
