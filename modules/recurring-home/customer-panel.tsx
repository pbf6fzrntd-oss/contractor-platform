import Link from "next/link";
import type { CustomerPanel } from "@/lib/modules/types";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { agreementStanding, BILLING_LABEL, type Billing } from "./rules/agreements";
import { reportFields, summarizeReport, type ReportValues } from "./rules/visit-report";
import { STANDING } from "./ui";

/** A customer's service agreements, on their customer page. */
export const AgreementsPanel: CustomerPanel = async ({ ctx, contactId, recurringServiceId }) => {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("rh_agreements").select("*").eq("org_id", ctx.org.id).eq("contact_id", contactId).order("created_at", { ascending: false });
  const today = localDateString(new Date(), ctx.org.timezone);
  const newHref = `/agreements/new?contact=${contactId}${recurringServiceId ? `&service=${recurringServiceId}` : ""}`;
  return (
    <section className="card mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Agreements</h2>
        <Link href={newHref} className="text-sm font-medium text-brand-700">+ Add</Link>
      </div>
      {(rows ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No plan on file. Add their quarterly plan, termite bond or season so they get a renewal reminder.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {rows!.map((a) => {
            const st = STANDING[agreementStanding(a, today)];
            return (
              <li key={a.id}>
                <Link href={`/agreements/${a.id}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block text-sm text-slate-600">
                      {a.price_cents != null ? `${money(a.price_cents)} ${BILLING_LABEL[a.billing as Billing]}` : ""}
                      {a.ends_on ? ` · ${a.auto_renew ? "renews" : "ends"} ${new Date(`${a.ends_on}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

/** The customer's recent visit reports (summary only; crew notes stay on the report page). */
export const VisitReportsPanel: CustomerPanel = async ({ ctx, contactId, recurringServiceId }) => {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("rh_visit_reports")
    .select("id, job_id, report, texted_at, created_at")
    .eq("org_id", ctx.org.id)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(5);
  const { data: jobs } = (reports ?? []).length ? await supabase.from("jobs").select("id, completed_on").in("id", reports!.map((r) => r.job_id)) : { data: [] };
  const fields = reportFields(ctx.org.industry);
  const today = localDateString(new Date(), ctx.org.timezone);
  return (
    <section className="card mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Visit reports</h2>
        {recurringServiceId && <Link href={`/visits/new?service=${recurringServiceId}&date=${today}`} className="text-sm font-medium text-brand-700">+ Today&apos;s visit</Link>}
      </div>
      {(reports ?? []).length === 0 ? (
        <p className="text-sm text-slate-500">No reports yet. Tap &quot;Report&quot; next to them on Today after a visit.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {reports!.map((r) => {
            const date = jobs?.find((j) => j.id === r.job_id)?.completed_on;
            return (
              <li key={r.id}>
                <Link href={`/visits/${r.job_id}`} className="block py-2">
                  <span className="block text-sm font-medium">
                    {date ? new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : ""}
                    {r.texted_at ? " · texted" : ""}
                  </span>
                  <span className="block truncate text-sm text-slate-600">{summarizeReport(fields, r.report as ReportValues, "en") || "Visit done"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
