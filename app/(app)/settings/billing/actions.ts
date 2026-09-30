"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/context";
import { getStripe } from "@/lib/billing/stripe";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

async function ensureCustomer(orgId: string, orgName: string, email: string | null) {
  const stripe = getStripe()!;
  const db = createAdminClient();
  const { data: sub } = await db.from("subscriptions").select("stripe_customer_id").eq("org_id", orgId).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;
  const customer = await stripe.customers.create({ name: orgName, email: email ?? undefined, metadata: { org_id: orgId } });
  await db.from("subscriptions").upsert({ org_id: orgId, stripe_customer_id: customer.id });
  return customer.id;
}

/** Checkout for a plan plus any add-ons ticked on the form (each add-on is its own Stripe price). */
export async function startCheckout(planId: string, formData?: FormData): Promise<void> {
  const { org, userId } = await requireOwner();
  const stripe = getStripe();
  if (!stripe) redirect("/settings/billing");
  const db = createAdminClient();
  const [{ data: plan }, { data: catalog }] = await Promise.all([
    db.from("plans").select("stripe_price_id, is_public").eq("id", planId).single(),
    db.from("addon_catalog").select("key, stripe_price_id, status"),
  ]);
  if (!plan?.stripe_price_id || !plan.is_public) redirect("/settings/billing");
  const wanted = (formData?.getAll("addon") ?? []).map(String);
  const addonPrices = (catalog ?? [])
    .filter((a) => wanted.includes(a.key) && a.status === "available" && a.stripe_price_id)
    .map((a) => ({ price: a.stripe_price_id!, quantity: 1 }));
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).single();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: await ensureCustomer(org.id, org.name, profile?.email ?? null),
    client_reference_id: org.id,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }, ...addonPrices],
    subscription_data: { metadata: { org_id: org.id } },
    success_url: `${publicEnv.siteUrl}/settings/billing?done=1`,
    cancel_url: `${publicEnv.siteUrl}/settings/billing`,
  });
  redirect(session.url!);
}

/** Adds or removes one add-on on an existing subscription (prorated by Stripe; the webhook turns it on or off). */
export async function changeAddon(key: string, add: boolean): Promise<void> {
  const { org } = await requireOwner();
  const stripe = getStripe();
  if (!stripe) redirect("/settings/billing");
  const db = createAdminClient();
  const [{ data: sub }, { data: addon }, { data: row }] = await Promise.all([
    db.from("subscriptions").select("stripe_subscription_id, status").eq("org_id", org.id).maybeSingle(),
    db.from("addon_catalog").select("stripe_price_id, status").eq("key", key).maybeSingle(),
    db.from("org_modules").select("stripe_subscription_item_id, source").eq("org_id", org.id).eq("module", key).maybeSingle(),
  ]);
  if (!sub?.stripe_subscription_id) redirect("/settings/billing");
  if (add) {
    if (!addon?.stripe_price_id || addon.status !== "available") redirect("/settings/billing");
    await stripe.subscriptionItems.create({ subscription: sub.stripe_subscription_id, price: addon.stripe_price_id, proration_behavior: "create_prorations" });
  } else if (row?.source === "addon" && row.stripe_subscription_item_id) {
    await stripe.subscriptionItems.del(row.stripe_subscription_item_id, { proration_behavior: "create_prorations" });
  }
  // The webhook (customer.subscription.updated) switches the module; refresh shortly after.
  revalidatePath("/settings/billing");
  redirect("/settings/billing?changed=1");
}

export async function openBillingPortal(): Promise<void> {
  const { org, userId } = await requireOwner();
  const stripe = getStripe();
  if (!stripe) redirect("/settings/billing");
  const db = createAdminClient();
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).single();
  const portal = await stripe.billingPortal.sessions.create({
    customer: await ensureCustomer(org.id, org.name, profile?.email ?? null),
    return_url: `${publicEnv.siteUrl}/settings/billing`,
  });
  redirect(portal.url);
}
