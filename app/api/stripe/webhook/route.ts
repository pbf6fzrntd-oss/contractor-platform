import type Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { getStripe, syncSubscription } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe tells us about payments and subscription changes here.
 * In the Stripe dashboard, send these events to /api/stripe/webhook:
 * checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe || !serverEnv.stripeWebhookSecret) return new Response("Billing not configured", { status: 404 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, request.headers.get("stripe-signature") ?? "", serverEnv.stripeWebhookSecret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  let subscriptionId: string | null = null;
  if (event.type === "checkout.session.completed") {
    const sub = event.data.object.subscription;
    subscriptionId = typeof sub === "string" ? sub : sub?.id ?? null;
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    subscriptionId = (event.data.object as Stripe.Subscription).id;
  }
  if (!subscriptionId) return Response.json({ received: true });
  const db = createAdminClient();
  try {
    const { data, error } = await db.rpc("claim_billing_sync", { p_subscription_id: subscriptionId, p_event_id: event.id });
    if (error || !data) throw error ?? new Error("Could not reserve billing sync");
    const claim = data as { done?: boolean; busy?: boolean; token?: string };
    if (claim.done) return Response.json({ received: true });
    if (claim.busy || !claim.token) return new Response("Subscription sync in progress; retry", { status: 503 });
    // Retrieve only after the lease is acquired: delayed events cannot revert current state.
    const current = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscription(db, current, event.id, claim.token);
    return Response.json({ received: true });
  } catch (error) {
    console.error("Billing reconciliation failed", error instanceof Error ? error.message : "database/provider error");
    // Lease expires after two minutes. No success receipt until ALL writes commit.
    return new Response("Billing reconciliation requires retry", { status: 503 });
  }
}
