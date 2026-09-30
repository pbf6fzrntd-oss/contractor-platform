import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { addonChanges, addonsActive, classifyItems, mapStripeStatus } from "@/lib/billing/rules";
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
  const status = mapStripeStatus(sub.status);
  await db
    .from("subscriptions")
    .upsert({
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status,
      current_period_end: periodEnd,
    });

  // One subscription = the plan + any add-ons (each add-on is its own Stripe product).
  const [{ data: plans }, { data: catalog }, { data: current }] = await Promise.all([
    db.from("plans").select("id, stripe_price_id"),
    db.from("addon_catalog").select("key, stripe_price_id"),
    db.from("org_modules").select("module, source, enabled").eq("org_id", orgId),
  ]);
  const { planId, addons } = classifyItems(
    sub.items.data.map((i) => ({ itemId: i.id, priceId: i.price?.id })),
    plans ?? [],
    catalog ?? [],
  );
  if (planId) await db.from("organizations").update({ plan_id: planId }).eq("id", orgId);

  const changes = addonChanges(current ?? [], addons.map((a) => a.key), addonsActive(status));
  for (const a of addons) {
    const existing = (current ?? []).find((c) => c.module === a.key);
    // Never downgrade a module that came with the edition, pilot or admin to a paid add-on row.
    if (existing && existing.source !== "addon") continue;
    await db.from("org_modules").upsert({ org_id: orgId, module: a.key, enabled: addonsActive(status), source: "addon", stripe_subscription_item_id: a.itemId });
  }
  if (changes.disable.length) {
    await db.from("org_modules").update({ enabled: false }).eq("org_id", orgId).eq("source", "addon").in("module", changes.disable);
  }
}
