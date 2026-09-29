import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { mapStripeStatus, planForPrice } from "@/lib/billing/rules";
import type { AdminClient } from "@/lib/supabase/admin";

let client: Stripe | null = null;

/** Null until STRIPE_SECRET_KEY is set (pilots are invoiced by hand until then). */
export function getStripe(): Stripe | null {
  if (!serverEnv.stripeSecretKey) return null;
  client ??= new Stripe(serverEnv.stripeSecretKey);
  return client;
}

/** Copies a Stripe subscription into our tables and switches the business to the matching plan. */
export async function syncSubscription(db: AdminClient, sub: Stripe.Subscription): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let orgId = (sub.metadata?.org_id as string | undefined) ?? null;
  if (!orgId) {
    const { data } = await db.from("subscriptions").select("org_id").eq("stripe_customer_id", customerId).maybeSingle();
    orgId = data?.org_id ?? null;
  }
  if (!orgId) {
    console.error("Stripe subscription without a matching business", sub.id);
    return;
  }

  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null;
  await db
    .from("subscriptions")
    .upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: mapStripeStatus(sub.status),
      current_period_end: periodEnd,
    });

  const { data: plans } = await db.from("plans").select("id, stripe_price_id");
  const planId = planForPrice(plans ?? [], item?.price?.id);
  if (planId) await db.from("organizations").update({ plan_id: planId }).eq("id", orgId);
}
