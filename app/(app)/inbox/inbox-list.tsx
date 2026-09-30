import Link from "next/link";
import { shortTime } from "@/lib/format";
import { LEAD_STAGES, stageLabel, type LeadStage } from "@/lib/leads/stages";
import type { Org } from "@/lib/org";
import { formatUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

const OPEN: LeadStage[] = ["new", "contacted", "estimate_sent"];

export function parseStageFilter(stage: unknown): LeadStage | null {
  return typeof stage === "string" && (LEAD_STAGES as readonly string[]).includes(stage) ? (stage as LeadStage) : null;
}

/**
 * The list of conversations (leads), with stage filters. Used on its own on
 * phones, and next to the open conversation on laptops.
 */
export async function InboxList({ org, filter, activeLeadId, compact = false }: { org: Org; filter: LeadStage | null; activeLeadId?: string; compact?: boolean }) {
  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, contact_id, stage, source, flag, unread, last_message_at, estimate_amount_cents")
    .eq("org_id", org.id)
    .order("last_message_at", { ascending: false })
    .limit(100);
  query = filter ? query.eq("stage", filter) : query.in("stage", OPEN);
  const { data: leads } = await query;
  const list = leads ?? [];

  const contactIds = [...new Set(list.map((l) => l.contact_id))];
  const [{ data: contacts }, { data: recent }, { data: subjects }] = await Promise.all([
    supabase.from("contacts").select("id, name, phone, opted_out_at").in("id", contactIds),
    supabase
      .from("messages")
      .select("lead_id, body, direction, created_at")
      .in(
        "lead_id",
        list.map((l) => l.id),
      )
      .order("created_at", { ascending: false })
      .limit(400),
    // Pets and vehicles show on the list (a property's address is on the lead page).
    supabase.from("subjects").select("contact_id, kind, label").in("contact_id", contactIds).in("kind", ["pet", "vehicle"]).is("archived_at", null),
  ]);
  const subjectsByContact = new Map<string, string[]>();
  for (const s of subjects ?? []) subjectsByContact.set(s.contact_id, [...(subjectsByContact.get(s.contact_id) ?? []), `${s.kind === "pet" ? "🐾" : "🚗"} ${s.label}`]);
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
  const lastMessage = new Map<string, { body: string; direction: string }>();
  for (const m of recent ?? []) if (m.lead_id && !lastMessage.has(m.lead_id)) lastMessage.set(m.lead_id, m);

  const tabs: { key: string; label: string; href: string }[] = [
    { key: "open", label: "Open", href: "/inbox" },
    ...LEAD_STAGES.map((s) => ({ key: s, label: stageLabel(org.business_type, s, org.industry), href: `/inbox?stage=${s}` })),
  ];
  const active = filter ?? "open";

  return (
    <>
      <nav className={`-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 ${compact ? "text-xs" : ""}`} aria-label="Filter leads">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${
              t.key === active ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {list.length === 0 ? (
        <div className="card text-center text-slate-600">
          {active === "open" ? "No open leads. Missed calls and new texts will show up here." : "Nothing in this stage yet."}
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden p-0">
          {list.map((lead) => {
            const contact = contactById.get(lead.contact_id);
            const last = lastMessage.get(lead.id);
            const selected = lead.id === activeLeadId;
            return (
              <li key={lead.id}>
                <Link
                  href={`/inbox/${lead.id}${filter ? `?stage=${filter}` : ""}`}
                  aria-current={selected ? "page" : undefined}
                  className={`flex gap-3 px-4 py-3 ${selected ? "bg-brand-50" : "hover:bg-slate-50"}`}
                >
                  <span
                    className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${lead.unread ? "bg-brand-600" : "bg-transparent"}`}
                    aria-label={lead.unread ? "Unread" : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate ${lead.unread ? "font-bold" : "font-medium"}`}>
                        {contact?.name ?? (contact ? formatUSPhone(contact.phone) : "Unknown")}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{shortTime(lead.last_message_at, org.timezone)}</span>
                    </span>
                    <span className="block truncate text-sm text-slate-600">
                      {lead.flag ? "⚠ " : ""}
                      {last ? `${last.direction === "outbound" ? "You: " : ""}${last.body}` : "Missed call"}
                    </span>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {stageLabel(org.business_type, lead.stage as LeadStage, org.industry)}
                      {contact?.opted_out_at ? " · opted out" : ""}
                    </span>
                    {subjectsByContact.get(lead.contact_id) && (
                      <span className="ml-2 text-xs text-slate-600">{subjectsByContact.get(lead.contact_id)!.join(" · ")}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
