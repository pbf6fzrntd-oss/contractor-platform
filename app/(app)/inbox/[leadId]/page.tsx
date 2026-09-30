import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { SubmitButton } from "@/components/submit-button";
import { Thread } from "@/components/thread";
import { requireAppContext } from "@/lib/auth/context";
import { money } from "@/lib/format";
import { bookingOn } from "@/lib/entitlements";
import { getIndustry } from "@/lib/industries";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/leads/stages";
import { formatUSPhone } from "@/lib/phone";
import { loadLeadForUser } from "@/lib/services/leads";
import { loadThread } from "@/lib/services/thread";
import { confirmOptOut, dismissFlag } from "./actions";
import { Composer, ContactForm, StagePicker } from "./lead-forms";
import { LeadExtras } from "./lead-extras";
import { BookingCard } from "./booking-card";
import { SubjectCard } from "./subject-card";

export const metadata: Metadata = { title: "Conversation" };

const SOURCE: Record<string, string> = {
  missed_call: "Missed call",
  inbound_text: "Texted in",
  campaign: "Campaign reply",
  manual: "Added by hand",
};

export default async function LeadPage({ params, searchParams }: PageProps<"/inbox/[leadId]">) {
  const ctx = await requireAppContext("/inbox");
  const { leadId } = await params;
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) notFound();
  const { lead, contact, supabase } = loaded;
  const { org } = ctx;

  if (lead.unread) await supabase.from("leads").update({ unread: false }).eq("id", lead.id);
  const thread = await loadThread(supabase, org.id, contact.id);
  const stages = LEAD_STAGES.map((s) => ({ value: s, label: stageLabel(org.business_type, s, org.industry) }));
  const industry = getIndustry(org.industry);

  return (
    <>
      <AutoRefresh seconds={10} />
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/inbox" className="mb-1 inline-flex min-h-10 items-center text-sm font-medium text-brand-700">
            ← Inbox
          </Link>
          <h1 className="truncate text-2xl font-bold">{contact.name ?? formatUSPhone(contact.phone)}</h1>
          <p className="text-sm text-slate-600">
            {contact.name ? `${formatUSPhone(contact.phone)} · ` : ""}
            {SOURCE[lead.source]}
            {lead.estimate_amount_cents ? ` · ${money(lead.estimate_amount_cents)}` : ""}
            {contact.preferred_language === "es" ? " · Spanish" : ""}
          </p>
        </div>
        <a href={`tel:${contact.phone}`} className="btn-secondary mt-8 min-h-11 shrink-0 px-4" aria-label="Call">
          📞 Call
        </a>
      </header>

      {lead.flag === "possible_opt_out" && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-2 font-medium">This reply might mean they want texts to stop. Please check.</p>
          <div className="flex gap-2">
            <form action={confirmOptOut.bind(null, lead.id)}>
              <SubmitButton className="btn-danger min-h-10 px-3 text-sm">Yes, stop texting them</SubmitButton>
            </form>
            <form action={dismissFlag.bind(null, lead.id)}>
              <SubmitButton className="btn-secondary min-h-10 px-3 text-sm">No, it&apos;s fine</SubmitButton>
            </form>
          </div>
        </div>
      )}
      {lead.flag === "cancel_keyword" && (
        <div className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p className="mb-2">
            They texted <strong>CANCEL</strong>. Phone carriers treat that as &quot;stop texting me,&quot; so they&apos;re
            unsubscribed. If they meant to cancel service, give them a call.
          </p>
          <form action={dismissFlag.bind(null, lead.id)}>
            <SubmitButton className="btn-secondary min-h-10 px-3 text-sm">Got it</SubmitButton>
          </form>
        </div>
      )}
      {contact.opted_out_at && lead.flag !== "cancel_keyword" && (
        <p className="mb-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Opted out of texts. They have to text START to get texts again.
        </p>
      )}

      <section className="card mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-600">Stage</h2>
        <StagePicker
          leadId={lead.id}
          current={lead.stage as LeadStage}
          stages={stages}
          estimateAmount={lead.estimate_amount_cents ? String(lead.estimate_amount_cents / 100) : ""}
        />
      </section>

      {industry && (
        <details className="card mb-4" open={lead.stage === "new"}>
          <summary className="cursor-pointer font-semibold">Questions to ask</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-slate-700">
            {industry.qualifyingQuestions.map((q) => (
              <li key={q.en}>
                {q.en}
                {contact.preferred_language === "es" && <span className="block text-slate-500">{q.es}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <SubjectCard ctx={ctx} leadId={lead.id} contactId={contact.id} />

      {bookingOn(org, ctx.plan, ctx.modules) && (
        <BookingCard ctx={ctx} leadId={lead.id} contactId={contact.id} service={param("book")} day={param("day")} booked={param("booked") === "1"} />
      )}

      <LeadExtras ctx={ctx} lead={lead} contact={contact} />

      <section>
        <Thread items={thread} timeZone={org.timezone} />
        <Composer
          leadId={lead.id}
          disabledReason={contact.opted_out_at ? "This customer opted out, so you can't text them." : undefined}
        />
      </section>

      <details className="card mt-6">
        <summary className="cursor-pointer font-semibold">Contact details</summary>
        <div className="mt-3">
          <ContactForm leadId={lead.id} contact={contact} />
        </div>
      </details>
    </>
  );
}
