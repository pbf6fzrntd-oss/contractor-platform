import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { STATUS_TEXT, type OurStatus } from "@/lib/billing/rules";
import { getStripe } from "@/lib/billing/stripe";
import { money } from "@/lib/format";
import { monthKey } from "@/lib/messaging/send";
import { createClient } from "@/lib/supabase/server";
import { changeAddon, openBillingPortal, startCheckout } from "./actions";

const status_ok = (s: string | null | undefined) => s === "active" || s === "trialing" || s === "past_due";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const { org, plan, role } = await requireAppContext();
  const { done, changed } = await searchParams;
  const supabase = await createClient();
  const [{ data: sub }, { data: usage }, { count: users }, { data: plans }, { data: catalog }, { data: myModules }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("org_id", org.id).maybeSingle(),
    supabase.from("usage_counters").select("sms_sent").eq("org_id", org.id).eq("month", monthKey(new Date(), org.timezone)).maybeSingle(),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
    supabase.from("plans").select("*").eq("is_public", true).order("sort_order"),
    supabase.from("addon_catalog").select("*").order("sort_order"),
    supabase.from("org_modules").select("module, source, enabled").eq("org_id", org.id),
  ]);
  const owned = new Set((myModules ?? []).filter((m) => m.enabled).map((m) => m.module));
  const buyable = (catalog ?? []).filter((a) => a.status === "available" && a.stripe_price_id);
  const subscribed = Boolean(sub?.stripe_subscription_id) && (status_ok(sub?.status));
  const { data: fullPlan } = await supabase.from("plans").select("name").eq("id", plan.id).single();
  const status = (sub?.status ?? "manual") as OurStatus;
  const stripeReady = Boolean(getStripe());
  const sent = usage?.sms_sent ?? 0;
  const pct = Math.min(100, Math.round((sent / Math.max(1, plan.monthly_sms_limit)) * 100));
  const purchasable = (plans ?? []).filter((p) => p.stripe_price_id);

  return (
    <>
      <PageHeader title="Billing" backHref="/settings" />
      {changed && <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">Change sent. It shows here within a minute.</p>}
      {done && <p className="mb-4 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">Thanks! Your subscription is being set up.</p>}

      <section className="card mb-4 flex flex-col gap-3">
        <div>
          <p className="text-sm text-slate-500">Your plan</p>
          <p className="text-2xl font-bold">{fullPlan?.name ?? plan.id}</p>
          <p className="text-sm text-slate-600">{STATUS_TEXT[status]}</p>
          {sub?.current_period_end && (status === "active" || status === "trialing" || status === "past_due") && (
            <p className="text-sm text-slate-500">
              Renews {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: org.timezone }).format(new Date(sub.current_period_end))}
            </p>
          )}
        </div>
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span>Texts this month</span>
            <span>{sent} of {plan.monthly_sms_limit}</span>
          </div>
          <div className="h-2 rounded-full bg-emerald-100" role="meter" aria-valuemin={0} aria-valuemax={plan.monthly_sms_limit} aria-valuenow={sent} aria-label="Texts used this month">
            <div className={`h-2 rounded-full ${pct >= 90 ? "bg-red-600" : pct >= 75 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="text-sm text-slate-600">Team logins: {users ?? 1} of {plan.max_users}</p>
      </section>

      {role !== "owner" ? (
        <p className="text-sm text-slate-600">Only the owner can change billing.</p>
      ) : !stripeReady ? (
        <p className="card text-sm text-slate-600">
          Online billing isn&apos;t turned on yet. During the pilot you&apos;re billed by invoice.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {purchasable.map((p) => (
            <form key={p.id} action={startCheckout.bind(null, p.id)} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{p.name} · {money(p.monthly_price_cents)}/mo</p>
                <p className="text-sm text-slate-600">
                  {p.monthly_sms_limit.toLocaleString()} texts · {p.max_users} logins
                  {p.feature_bulk_messaging ? " · rain delays & campaigns" : ""}
                  {p.feature_team_ai ? " · AI for your whole team" : ""}
                  {p.feature_agent_ready ? " · Agent Ready (profile, online booking, AI-agent booking)" : ""}
                  {p.feature_ai_voice ? " · AI phone line (coming)" : ""}
                  {p.included_addons > 0 && p.included_addons < 99 ? ` · ${p.included_addons} industry module included` : ""}
                </p>
                {buyable
                  .filter((a) => !(a.key === "agent_ready" && p.feature_agent_ready))
                  .map((a) => (
                    <label key={a.key} className="mt-1 flex items-center gap-2 text-sm">
                      <input type="checkbox" name="addon" value={a.key} className="h-5 w-5 accent-brand-600" />
                      Add {a.name} (+{money(a.monthly_price_cents)}/mo)
                    </label>
                  ))}
              </div>
              {p.id === plan.id && (status === "active" || status === "trialing") ? (
                <span className="text-sm font-medium text-brand-700">Current</span>
              ) : (
                <SubmitButton className="btn-primary min-h-10 px-4 text-sm" pendingText="…">Choose</SubmitButton>
              )}
            </form>
          ))}
          {subscribed && buyable.length > 0 && (
            <section className="card flex flex-col gap-2">
              <h2 className="font-semibold">Add-ons</h2>
              {buyable.map((a) => {
                const has = owned.has(a.key);
                const included = a.key === "agent_ready" && plan.feature_agent_ready;
                return (
                  <div key={a.key} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{a.name} · {money(a.monthly_price_cents)}/mo</span>
                      <span className="block text-sm text-slate-600">{a.description}</span>
                    </span>
                    {included ? (
                      <span className="shrink-0 text-sm text-brand-700">Included</span>
                    ) : (
                      <form action={changeAddon.bind(null, a.key, !has)}>
                        <SubmitButton className={`${has ? "btn-secondary" : "btn-primary"} min-h-10 shrink-0 px-3 text-sm`} pendingText="…">{has ? "Remove" : "Add"}</SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          {(catalog ?? []).some((a) => a.status === "coming_soon") && (
            <p className="text-sm text-slate-600">
              Coming soon as add-ons: {(catalog ?? []).filter((a) => a.status === "coming_soon").map((a) => a.name).join(", ")}.
            </p>
          )}
          {sub?.stripe_customer_id && (
            <form action={openBillingPortal}>
              <SubmitButton className="btn-secondary w-full" pendingText="Opening…">Update card, invoices or cancel</SubmitButton>
            </form>
          )}
        </div>
      )}
    </>
  );
}
