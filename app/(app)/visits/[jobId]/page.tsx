import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireModule } from "@/lib/auth/context";
import { signedUrl } from "@/lib/files/storage";
import { createClient } from "@/lib/supabase/server";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { contactName } from "@/modules/recurring-home/queries";
import { outOfRange, reportFields, summarizeReport, type ReportValues } from "@/modules/recurring-home/rules/visit-report";

export const metadata: Metadata = { title: "Visit report" };

/** One visit: what was done, readings, notes and photos (team-only screen). */
export default async function VisitPage({ params, searchParams }: PageProps<"/visits/[jobId]">) {
  const { org } = await requireModule(MODULE_ID);
  const { jobId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("id, completed_on, contact_id, recurring_service_id").eq("id", jobId).eq("org_id", org.id).maybeSingle();
  if (!job) notFound();
  const [{ data: report }, { data: contact }, { data: service }, { data: files }] = await Promise.all([
    supabase.from("rh_visit_reports").select("*").eq("job_id", job.id).maybeSingle(),
    supabase.from("contacts").select("name, phone").eq("id", job.contact_id).single(),
    job.recurring_service_id ? supabase.from("recurring_services").select("id, service_type").eq("id", job.recurring_service_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("files").select("id, storage_path, content_type").eq("org_id", org.id).eq("job_id", job.id).is("deleted_at", null).limit(12),
  ]);
  const fields = reportFields(org.industry);
  const values = (report?.report ?? {}) as ReportValues;
  const warnings = outOfRange(fields, values);
  const photos = await Promise.all((files ?? []).map(async (f) => ({ ...f, url: await signedUrl(f.storage_path) })));
  const day = new Date(`${job.completed_on}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={contactName(contact)} subtitle={`${service?.service_type ?? "Visit"} · ${day}`} backHref={service ? `/customers/${service.id}` : "/today"} />
      {sp.saved === "1" && (
        <p role="status" className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
          ✓ Visit saved.
          {sp.texted === "sent" ? " The customer just got their text." : sp.texted === "queued" ? " Their text goes out when business hours start." : ""}
        </p>
      )}
      {warnings.length > 0 && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">⚠ {warnings.join(" · ")}</p>
      )}
      <section className="card mb-4 flex flex-col gap-2">
        <h2 className="font-semibold">What was done</h2>
        <p className="text-slate-700">{report ? summarizeReport(fields, values, "en") || "Nothing ticked." : "No report yet (the visit was marked done from Today)."}</p>
        {report?.customer_note && <p className="text-sm text-slate-600">Note for the customer: {report.customer_note}</p>}
        {report?.private_note && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
            <span className="block text-xs font-semibold text-amber-900">🔒 Crew notes</span>
            {report.private_note}
          </p>
        )}
        {report && <p className="text-xs text-slate-500">{report.texted_at ? "✓ Customer was texted that the service is done." : "No \"service complete\" text sent."}</p>}
      </section>
      {photos.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-2 font-semibold">Photos</h2>
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p) =>
              p.url ? (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed link */}
                    <img src={p.url} alt="Visit photo" className="aspect-square w-full rounded-lg object-cover" />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      )}
      {service && (
        <Link href={`/visits/new?service=${service.id}&date=${job.completed_on}`} className="btn-secondary w-full">
          {report ? "Edit this visit" : "Fill in the visit report"}
        </Link>
      )}
    </>
  );
}
