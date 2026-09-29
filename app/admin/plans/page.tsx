import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePlan } from "../actions";

export const metadata: Metadata = { title: "Admin · Plans" };

export default async function PlansPage() {
  const { data: plans } = await createAdminClient().from("plans").select("*").order("sort_order");
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Plans & prices</h1>
      <p className="mb-4 text-sm text-slate-600">
        Create each plan as a monthly Price in Stripe, then paste its price ID (price_...) here. Feature switches are
        changed in the database for now.
      </p>
      <div className="flex flex-col gap-4">
        {(plans ?? []).map((p) => (
          <section key={p.id} className="card">
            <h2 className="mb-2 font-semibold">
              {p.name} <span className="text-sm font-normal text-slate-500">({p.id}{p.is_public ? "" : ", hidden"})</span>
            </h2>
            <ActionForm action={updatePlan.bind(null, p.id)}>
              <label className="label" htmlFor={`price-${p.id}`}>Monthly price ($)</label>
              <input id={`price-${p.id}`} name="monthly_price" defaultValue={p.monthly_price_cents / 100} className="input" inputMode="decimal" />
              <label className="label" htmlFor={`stripe-${p.id}`}>Stripe price ID</label>
              <input id={`stripe-${p.id}`} name="stripe_price_id" defaultValue={p.stripe_price_id ?? ""} className="input" placeholder="price_..." />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor={`users-${p.id}`}>Logins</label>
                  <input id={`users-${p.id}`} name="max_users" defaultValue={p.max_users} className="input" inputMode="numeric" />
                </div>
                <div>
                  <label className="label" htmlFor={`sms-${p.id}`}>Texts / month</label>
                  <input id={`sms-${p.id}`} name="monthly_sms_limit" defaultValue={p.monthly_sms_limit} className="input" inputMode="numeric" />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Features: {[p.feature_recurring_customers && "customers", p.feature_bulk_messaging && "bulk texts", p.feature_campaigns && "campaigns"].filter(Boolean).join(", ") || "core only"}
              </p>
            </ActionForm>
          </section>
        ))}
      </div>
    </>
  );
}
