import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireModule } from "@/lib/auth/context";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { contactName } from "@/modules/recurring-home/queries";
import { agreementStanding, BILLING_LABEL, daysUntil, visitsPerYear, yearlyValueCents, type Billing } from "@/modules/recurring-home/rules/agreements";
import { STANDING } from "@/modules/recurring-home/ui";

export const metadata: Metadata = { title: "Agreements" };

/** Service agreements: what's renewing soon, what's active, and what they're worth. */
export default async function AgreementsPage() {
  const { org } = await requireModule(MODULE_ID, "/agreements");
  const supabase = await createClient();
  const { data: rows } = await supabase.from("rh_agreements").select("*").eq("org_id", org.id).order("ends_on", { ascending: true, nullsFirst: false }).limit(1000);
  const list = rows ?? [];
  const [{ data: contacts }, { data: services }] = await Promise.all([
    supabase.from("contacts").select("id, name, phone").in("id", [...new Set(list.map((a) => a.contact_id))]),
    supabase.from("recurring_services").select("id, frequency").eq("org_id", org.id),
  ]);
  const today = localDateString(new Date(), org.timezone);
  const withStanding = list.map((a) => ({
    a,
    standing: agreementStanding(a, today),
    yearly: yearlyValueCents(a, visitsPerYear(services?.find((s) => s.id === a.recurring_service_id)?.frequency)),
  }));
  const live = withStanding.filter((x) => ["ongoing", "active", "renewing_soon", "overdue"].includes(x.standing));
  const soon = live.filter((x) => x.standing === "renewing_soon" || x.standing === "overdue");
  const yearly = live.reduce((s, x) => s + (x.yearly ?? 0), 0);
  const soonValue = soon.reduce((s, x) => s + (x.yearly ?? 0), 0);

  const Row = ({ x }: { x: (typeof withStanding)[number] }) => {
    const c = contacts?.find((y) => y.id === x.a.contact_id);
    const st = STANDING[x.standing];
    return (
      <li>
        <Link href={`/agreements/${x.a.id}`} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50">
          <span className="min-w-0">
            <span className="block truncate font-medium">{contactName(c)}</span>
            <span className="block truncate text-sm text-slate-600">
              {x.a.name}
              {x.a.price_cents != null ? ` · ${money(x.a.price_cents)} ${BILLING_LABEL[x.a.billing as Billing]}` : ""}
            </span>
            {x.a.ends_on && (
              <span className="block text-xs text-slate-500">
                {x.a.auto_renew ? "Renews" : "Ends"} {new Date(`${x.a.ends_on}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                {x.standing === "renewing_soon" ? ` (in ${daysUntil(x.a.ends_on, today)} days)` : ""}
                {x.a.renewal_notice_for === x.a.ends_on ? " · reminder queued" : ""}
              </span>
            )}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div data-wide>
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="Agreements" subtitle="Service plans, termite bonds and seasons, with automatic renewal reminders." />
        <Link href="/agreements/new" className="btn-primary min-h-10 shrink-0 px-3 text-sm">+ New</Link>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
        <StatTile label="Active agreements" value={String(live.length)} />
        <StatTile label="Worth about, per year" value={money(yearly)} detail="Per-visit plans count the customer's route" />
        <StatTile label="Renewing in the next month" value={String(soon.length)} detail={soon.length ? `${money(soonValue)} a year` : "Nothing coming up"} />
      </div>
      {list.length === 0 ? (
        <div className="card text-center text-slate-600">
          <p className="mb-3">No agreements yet. Add the plans your customers are on (quarterly pest control, termite bonds, pool seasons, cleaning plans), and we&apos;ll remind them before they renew.</p>
          <Link href="/agreements/new" className="btn-primary">Add the first agreement</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start">
          {soon.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-amber-800">Coming up ({soon.length})</h2>
              <ul className="card divide-y divide-slate-100 p-0">{soon.map((x) => <Row key={x.a.id} x={x} />)}</ul>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Active ({live.length - soon.length})</h2>
            <ul className="card divide-y divide-slate-100 p-0">{live.filter((x) => !soon.includes(x)).map((x) => <Row key={x.a.id} x={x} />)}</ul>
          </section>
          {withStanding.length > live.length && (
            <details className="lg:col-span-2">
              <summary className="cursor-pointer text-sm font-semibold text-slate-600">Ended and canceled ({withStanding.length - live.length})</summary>
              <ul className="card mt-2 divide-y divide-slate-100 p-0">{withStanding.filter((x) => !live.includes(x)).map((x) => <Row key={x.a.id} x={x} />)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
