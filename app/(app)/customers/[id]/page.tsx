import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { requireAppContext } from "@/lib/auth/context";
import { effectiveStatus, FREQUENCY_LABEL, nextServiceDate, type Frequency } from "@/lib/automation/schedule";
import { money } from "@/lib/format";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { DAY_NAMES, localDateString } from "@/lib/time";
import { openConversation, resumeService, revokeMarketingConsent } from "./actions";
import { serviceSuggestions } from "../customer-fields";
import { AccessNotesForm, EditServiceForm, MarketingConsentForm, PauseCancelForms } from "./forms";
import { moduleCustomerPanels } from "@/lib/modules/types";
import { MODULES } from "@/modules/registry";

export const metadata: Metadata = { title: "Customer" };

const STATUS_STYLE = {
  active: "bg-emerald-50 text-emerald-800",
  paused: "bg-amber-50 text-amber-800",
  canceled: "bg-slate-200 text-slate-700",
};

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const ctx = await requireAppContext("/customers");
  const { org } = ctx;
  const { id } = await params;
  const supabase = await createClient();
  const { data: service } = await supabase.from("recurring_services").select("*").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!service) notFound();

  const [{ data: contact }, { data: moves }, { data: visits }, { data: consentLog }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", service.contact_id).single(),
    supabase.from("service_date_moves").select("recurring_service_id, from_date, to_date").eq("recurring_service_id", id),
    supabase.from("jobs").select("id, completed_on").eq("recurring_service_id", id).order("completed_on", { ascending: false }).limit(8),
    supabase
      .from("consent_events")
      .select("id, kind, method, evidence, created_at")
      .eq("contact_id", service.contact_id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (!contact) notFound();
  // Private access notes live on the customer's property record (team-only; never texted or shared).
  const { data: property } = await supabase
    .from("subjects")
    .select("id")
    .eq("org_id", org.id)
    .eq("contact_id", contact.id)
    .eq("kind", "property")
    .is("archived_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const { data: priv } = property ? await supabase.from("subject_private").select("access_notes").eq("subject_id", property.id).maybeSingle() : { data: null };
  const panels = moduleCustomerPanels(MODULES, ctx.modules);

  const today = localDateString(new Date(), org.timezone);
  const status = effectiveStatus(service, today);
  const next = status === "active" ? nextServiceDate(service, today, moves ?? []) : null;
  const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const tsFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: org.timezone });

  return (
    <>
      <PageHeader title={contact.name ?? formatUSPhone(contact.phone)} backHref="/customers" />
      <div className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[status]}`}>
          {status === "active" ? "Active" : status === "paused" ? `Paused${service.paused_until ? ` until ${dateFmt.format(new Date(service.paused_until))}` : ""}` : "Canceled"}
        </span>
        <span>{formatUSPhone(contact.phone)}</span>
        {contact.preferred_language === "es" && <span>· Spanish</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <a href={`tel:${contact.phone}`} className="btn-secondary">📞 Call</a>
        <form action={openConversation.bind(null, id)}>
          <SubmitButton className="btn-primary w-full" pendingText="Opening…">💬 Text</SubmitButton>
        </form>
      </div>

      <section className="card mb-4 flex flex-col gap-1">
        <p className="font-semibold">
          {service.service_type} · {money(service.price_cents)}
        </p>
        <p className="text-slate-600">
          {DAY_NAMES.en[service.service_day]}s, {FREQUENCY_LABEL[service.frequency as Frequency].toLowerCase()}
        </p>
        {contact.address && <p className="text-slate-600">{contact.address}</p>}
        {next && <p className="text-sm text-slate-500">Next visit: {dateFmt.format(new Date(next))}</p>}
        {service.status === "canceled" && service.cancel_reason && (
          <p className="text-sm text-slate-500">
            Canceled {service.canceled_on ? dateFmt.format(new Date(service.canceled_on)) : ""}: {service.cancel_reason}
          </p>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-1 font-semibold">🔑 Access notes</h2>
        <p className="mb-2 text-xs text-slate-500">Gate codes, lockbox, alarm, pets. Only your team sees these; they&apos;re never texted or shared with AI assistants.</p>
        <AccessNotesForm id={id} notes={priv?.access_notes ?? ""} />
      </section>

      {await Promise.all(panels.map(async (Panel, i) => <div key={i}>{await Panel({ ctx, contactId: contact.id, recurringServiceId: id })}</div>))}

      <section className="card mb-4">
        {status === "active" && <PauseCancelForms id={id} canPause />}
        {status !== "active" && (
          <div className="flex flex-col gap-2">
            <form action={resumeService.bind(null, id)}>
              <SubmitButton className="btn-primary w-full">{status === "paused" ? "Resume now" : "Reactivate customer"}</SubmitButton>
            </form>
            {status === "paused" && <PauseCancelForms id={id} canPause={false} />}
          </div>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Text permissions</h2>
        {contact.opted_out_at ? (
          <p className="text-sm text-amber-800">Opted out of all texts. They must text START to opt back in.</p>
        ) : contact.marketing_consent_at ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>✓ Service texts · ✓ Offers and promotions (since {tsFmt.format(new Date(contact.marketing_consent_at))})</p>
            <form action={revokeMarketingConsent.bind(null, id)}>
              <SubmitButton className="text-sm font-medium text-red-700">Remove marketing consent</SubmitButton>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>✓ Service texts · ✗ No consent for offers, so they won&apos;t get campaigns.</p>
            <MarketingConsentForm id={id} />
          </div>
        )}
        {(consentLog ?? []).length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-slate-600">Permission history</summary>
            <ul className="mt-2 flex flex-col gap-1 text-slate-600">
              {(consentLog ?? []).map((e) => (
                <li key={e.id}>
                  {tsFmt.format(new Date(e.created_at))}: {e.kind.replace(/_/g, " ")} ({e.method.replace(/_/g, " ")})
                  {e.evidence ? `: ${e.evidence}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Recent visits</h2>
        {(visits ?? []).length ? (
          <ul className="text-sm text-slate-600">
            {(visits ?? []).map((v) => <li key={v.id}>✓ {dateFmt.format(new Date(v.completed_on))}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No visits marked done yet (use &quot;Mark day complete&quot; on Today).</p>
        )}
      </section>

      <details className="card">
        <summary className="cursor-pointer font-semibold">Edit service</summary>
        <div className="mt-3">
          <EditServiceForm
            id={id}
            defaults={{
              service_type: service.service_type,
              frequency: service.frequency,
              service_day: service.service_day,
              price: service.price_cents ? String(service.price_cents / 100) : "",
              start_date: service.start_date,
            }}
            suggestions={serviceSuggestions(org.industry)}
          />
        </div>
      </details>
    </>
  );
}
