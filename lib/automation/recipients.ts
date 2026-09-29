import { effectiveStatus, isScheduledOn, type DateMove, type ServiceSchedule } from "@/lib/automation/schedule";

/**
 * Who gets a bulk text. Pure functions so the rules are easy to test:
 * - Service notices (rain delay): customers scheduled on that day.
 * - Campaigns: active and/or past customers WITH written marketing consent.
 * Nobody who opted out, and nobody twice.
 */

export type RecipientContact = {
  id: string;
  phone: string;
  name: string | null;
  preferred_language: string;
  opted_out_at: string | null;
  marketing_consent_at: string | null;
};

export type ServiceWithContact = ServiceSchedule & { contact_id: string; service_type: string };

export type Recipient = { contactId: string; serviceIds: string[]; language: "en" | "es" };

export type Selection = {
  recipients: Recipient[];
  excluded: { opted_out: number; no_marketing_consent: number };
};

function lang(c: RecipientContact): "en" | "es" {
  return c.preferred_language === "es" ? "es" : "en";
}

export function selectNoticeRecipients(
  services: ServiceWithContact[],
  contacts: RecipientContact[],
  date: string,
  moves: DateMove[] = [],
): Selection {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const found = new Map<string, Recipient>();
  const optedOut = new Set<string>();

  for (const s of services) {
    if (!isScheduledOn(s, date, moves)) continue;
    const c = byId.get(s.contact_id);
    if (!c) continue;
    if (c.opted_out_at) {
      optedOut.add(c.id);
      continue;
    }
    const existing = found.get(c.id);
    if (existing) existing.serviceIds.push(s.id);
    else found.set(c.id, { contactId: c.id, serviceIds: [s.id], language: lang(c) });
  }
  return { recipients: [...found.values()], excluded: { opted_out: optedOut.size, no_marketing_consent: 0 } };
}

export type CampaignAudience = {
  /** "active" = currently on service (incl. paused); "past" = all their services canceled. */
  statuses: ("active" | "past")[];
  /** Only customers with one of these service types. Empty = everyone. */
  serviceTypes?: string[];
};

export function customerStatus(services: ServiceWithContact[], today: string): "active" | "past" | null {
  if (services.length === 0) return null;
  return services.some((s) => effectiveStatus(s, today) !== "canceled") ? "active" : "past";
}

export function selectCampaignRecipients(
  services: ServiceWithContact[],
  contacts: RecipientContact[],
  audience: CampaignAudience,
  today: string,
): Selection {
  const servicesByContact = new Map<string, ServiceWithContact[]>();
  for (const s of services) {
    const list = servicesByContact.get(s.contact_id) ?? [];
    list.push(s);
    servicesByContact.set(s.contact_id, list);
  }
  const types = (audience.serviceTypes ?? []).map((t) => t.toLowerCase());
  const selection: Selection = { recipients: [], excluded: { opted_out: 0, no_marketing_consent: 0 } };

  for (const c of contacts) {
    const theirs = servicesByContact.get(c.id) ?? [];
    const status = customerStatus(theirs, today);
    if (!status || !audience.statuses.includes(status)) continue;
    if (types.length && !theirs.some((s) => types.includes(s.service_type.toLowerCase()))) continue;
    if (c.opted_out_at) {
      selection.excluded.opted_out++;
      continue;
    }
    if (!c.marketing_consent_at) {
      selection.excluded.no_marketing_consent++;
      continue;
    }
    selection.recipients.push({ contactId: c.id, serviceIds: theirs.map((s) => s.id), language: lang(c) });
  }
  return selection;
}
