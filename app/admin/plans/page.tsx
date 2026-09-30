import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateAddon, updatePlan } from "../actions";

export const metadata: Metadata = { title: "Admin · Plans" };

export default async function PlansPage() {
  const db = createAdminClient();
  const [{ data: plans }, { data: addons }] = await Promise.all([
    db.from("plans").select("*").order("sort_order"),
    db.from("addon_catalog").select("*").order("sort_order"),
  ]);
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
                Features:{" "}
                {[
                  p.feature_recurring_customers && "customers",
                  p.feature_bulk_messaging && "bulk texts",
                  p.feature_campaigns && "campaigns",
                  p.feature_team_ai && "team AI",
                  p.feature_agent_ready && "Agent Ready",
                  p.feature_booking && "booking",
                  p.feature_approvals && "approvals",
                  p.feature_ai_voice && "AI voice",
                ]
                  .filter(Boolean)
                  .join(", ") || "core only"}
                {p.included_addons > 0 ? ` · ${p.included_addons >= 99 ? "all" : p.included_addons} industry module(s) included` : ""}
              </p>
            </ActionForm>
          </section>
        ))}
      </div>

      <h2 className="mb-1 mt-8 text-xl font-bold">Add-ons</h2>
      <p className="mb-4 text-sm text-slate-600">Each add-on is its own Stripe product with a monthly price. Only &quot;available&quot; add-ons with a price ID can be bought.</p>
      <div className="flex flex-col gap-4">
        {(addons ?? []).map((a) => (
          <section key={a.key} className="card">
            <h3 className="mb-1 font-semibold">{a.name} <span className="text-sm font-normal text-slate-500">({a.key})</span></h3>
            <p className="mb-2 text-sm text-slate-600">{a.description}</p>
            <ActionForm action={updateAddon.bind(null, a.key)}>
              <label className="label" htmlFor={`aprice-${a.key}`}>Monthly price ($)</label>
              <input id={`aprice-${a.key}`} name="monthly_price" defaultValue={a.monthly_price_cents / 100} className="input" inputMode="decimal" />
              <label className="label" htmlFor={`astripe-${a.key}`}>Stripe price ID</label>
              <input id={`astripe-${a.key}`} name="stripe_price_id" defaultValue={a.stripe_price_id ?? ""} className="input" placeholder="price_..." />
              <select name="status" defaultValue={a.status} className="input" aria-label="Status">
                <option value="available">Available to buy</option>
                <option value="coming_soon">Coming soon (sales only)</option>
              </select>
            </ActionForm>
          </section>
        ))}
      </div>
    </>
  );
}
