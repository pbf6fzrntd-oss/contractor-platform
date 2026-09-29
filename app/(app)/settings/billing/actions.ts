"use server";

import { redirect } from "next/navigation";
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

export async function startCheckout(planId: string): Promise<void> {
  const { org, userId } = await requireOwner();
  const stripe = getStripe();
  if (!stripe) redirect("/settings/billing");
  const db = createAdminClient();
  const { data: plan } = await db.from("plans").select("stripe_price_id, is_public").eq("id", planId).single();
  if (!plan?.stripe_price_id || !plan.is_public) redirect("/settings/billing");
  const { data: profile } = await db.from("profiles").select("email").eq("id", userId).single();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: await ensureCustomer(org.id, org.name, profile?.email ?? null),
    client_reference_id: org.id,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    subscription_data: { metadata: { org_id: org.id } },
    success_url: `${publicEnv.siteUrl}/settings/billing?done=1`,
    cancel_url: `${publicEnv.siteUrl}/settings/billing`,
  });
  redirect(session.url!);
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
