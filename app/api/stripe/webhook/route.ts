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

  const db = createAdminClient();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.subscription) {
        const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(db, await stripe.subscriptions.retrieve(id));
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(db, event.data.object);
      break;
  }
  return Response.json({ received: true });
}
