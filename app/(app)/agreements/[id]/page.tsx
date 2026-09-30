import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireModule } from "@/lib/auth/context";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { agreementCustomers, contactName } from "@/modules/recurring-home/queries";
import { agreementPresets, agreementStanding, BILLING_LABEL, visitsPerYear, yearlyValueCents, type Billing } from "@/modules/recurring-home/rules/agreements";
import { renewalReminderText } from "@/modules/recurring-home/rules/messages";
import { STANDING } from "@/modules/recurring-home/ui";
import { deleteAgreement, renewAgreement, saveAgreement, sendRenewalReminderNow, setAgreementStatus } from "../actions";
import { AgreementForm } from "../form";
import { ReminderButton } from "./reminder-button";

export const metadata: Metadata = { title: "Agreement" };

const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function AgreementPage({ params, searchParams }: PageProps<"/agreements/[id]">) {
  const ctx = await requireModule(MODULE_ID, "/agreements");
  const { org } = ctx;
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: a } = await supabase.from("rh_agreements").select("*").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!a) notFound();
  const [{ data: contact }, { data: service }, customers] = await Promise.all([
    supabase.from("contacts").select("id, name, phone, preferred_language").eq("id", a.contact_id).single(),
    a.recurring_service_id ? supabase.from("recurring_services").select("id, frequency, service_type").eq("id", a.recurring_service_id).maybeSingle() : Promise.resolve({ data: null }),
    agreementCustomers(supabase, org.id),
  ]);
  const today = localDateString(new Date(), org.timezone);
  const standing = agreementStanding(a, today);
  const st = STANDING[standing];
  const yearly = yearlyValueCents(a, visitsPerYear(service?.frequency));
  const live = a.status === "active";
  const lang = contact?.preferred_language === "es" ? "es" : "en";

  return (
    <>
      <PageHeader title={a.name} backHref="/agreements" />
      {sp.saved === "1" && <p role="status" className="mb-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800">Saved.</p>}
      <section className="card mb-4 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <Link href={service ? `/customers/${service.id}` : "/customers"} className="font-semibold text-brand-700 underline">{contactName(contact)}</Link>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
        </div>
        {service && <p className="text-sm text-slate-600">Covers: {service.service_type}</p>}
        <p className="text-slate-700">
          {a.price_cents != null ? `${money(a.price_cents)} ${BILLING_LABEL[a.billing as Billing]}` : "No price set"}
          {yearly ? ` · about ${money(yearly)} a year` : ""}
        </p>
        <p className="text-sm text-slate-600">
          Since {day(a.starts_on)}
          {a.ends_on ? ` · ${a.auto_renew ? "renews" : "ends"} ${day(a.ends_on)}` : " · no end date"}
        </p>
        {a.ends_on && a.renewal_notice_days > 0 && (
          <p className="text-sm text-slate-500">
            {a.renewal_notice_for === a.ends_on ? "✓ Renewal reminder queued; check inbox for delivery." : `Customer gets a reminder ${a.renewal_notice_days} days before.`}
          </p>
        )}
      </section>

      {live && a.ends_on && (
        <section className="card mb-4 flex flex-col gap-3">
          <h2 className="font-semibold">Renewal</h2>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="block text-xs font-semibold text-slate-500">The reminder text</span>
            {renewalReminderText(lang, org.name, a.name, new Date(`${a.ends_on}T12:00:00Z`).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", timeZone: "UTC" }), a.auto_renew)}
          </p>
          <form action={renewAgreement.bind(null, a.id)}>
            <SubmitButton className="btn-primary w-full">Renew now (next {a.term_months} months)</SubmitButton>
          </form>
          <ReminderButton action={sendRenewalReminderNow.bind(null, a.id)} label={a.renewal_notice_for === a.ends_on ? "Reminder already queued" : "Text the reminder now"} />
        </section>
      )}

      <details className="card mb-4">
        <summary className="cursor-pointer font-semibold">Edit</summary>
        <div className="mt-3">
          <AgreementForm
            action={saveAgreement.bind(null, a.id)}
            customers={customers}
            presets={agreementPresets(org.industry)}
            defaults={{ ...a, price: a.price_cents != null ? String(a.price_cents / 100) : "" }}
            submitLabel="Save changes"
          />
        </div>
      </details>

      <section className="grid grid-cols-2 gap-2">
        {live ? (
          <>
            <form action={setAgreementStatus.bind(null, a.id, "ended")}><SubmitButton className="btn-secondary w-full text-sm">Mark ended</SubmitButton></form>
            <form action={setAgreementStatus.bind(null, a.id, "canceled")}><SubmitButton className="btn-secondary w-full text-sm">Customer canceled</SubmitButton></form>
          </>
        ) : (
          <form action={setAgreementStatus.bind(null, a.id, "active")} className="col-span-2"><SubmitButton className="btn-secondary w-full">Make active again</SubmitButton></form>
        )}
        {ctx.role === "owner" && (
          <form action={deleteAgreement.bind(null, a.id)} className="col-span-2"><SubmitButton className="btn-danger w-full text-sm" pendingText="Deleting…">Delete agreement</SubmitButton></form>
        )}
      </section>
    </>
  );
}
