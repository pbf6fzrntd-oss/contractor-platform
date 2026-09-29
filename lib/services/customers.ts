import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Frequency } from "@/lib/automation/schedule";
import { MARKETING_CONSENT_METHODS, type MarketingConsentMethod } from "@/lib/consent";

type Db = SupabaseClient<Database>;

export type NewCustomer = {
  phone: string;
  name: string | null;
  address: string | null;
  email: string | null;
  language: "en" | "es";
  service_type: string;
  frequency: Frequency;
  service_day: number;
  price_cents: number | null;
  start_date: string;
};


/**
 * Adds a recurring customer: contact (reusing one with the same phone),
 * the service, and the consent records the owner confirmed.
 */
export async function addRecurringCustomer(
  db: Db,
  orgId: string,
  input: NewCustomer,
  consent: {
    serviceTextsMethod: "owner_recorded" | "import_attestation";
    marketing?: { method: MarketingConsentMethod; evidence?: string | null } | null;
  },
): Promise<{ contactId: string; serviceId: string }> {
  const { data: existing } = await db.from("contacts").select("*").eq("org_id", orgId).eq("phone", input.phone).maybeSingle();
  let contactId: string;
  if (existing) {
    contactId = existing.id;
    // Fill in blanks, but don't overwrite what the business already has.
    await db
      .from("contacts")
      .update({
        name: existing.name ?? input.name,
        address: existing.address ?? input.address,
        email: existing.email ?? input.email,
        preferred_language: existing.name ? existing.preferred_language : input.language,
      })
      .eq("id", contactId);
  } else {
    const { data, error } = await db
      .from("contacts")
      .insert({
        org_id: orgId,
        phone: input.phone,
        name: input.name,
        address: input.address,
        email: input.email,
        preferred_language: input.language,
      })
      .select("id")
      .single();
    if (error) throw error;
    contactId = data.id;
  }

  const { data: service, error } = await db
    .from("recurring_services")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      service_type: input.service_type,
      frequency: input.frequency,
      service_day: input.service_day,
      start_date: input.start_date,
      price_cents: input.price_cents,
    })
    .select("id")
    .single();
  if (error) throw error;

  await db.rpc("record_consent_event", {
    p_org_id: orgId,
    p_contact_id: contactId,
    p_kind: "service_texts_attested",
    p_method: consent.serviceTextsMethod,
    p_evidence: "Owner confirmed this customer agreed to texts about their service.",
  });
  if (consent.marketing) {
    await db.rpc("record_consent_event", {
      p_org_id: orgId,
      p_contact_id: contactId,
      p_kind: "marketing_granted",
      p_method: consent.marketing.method,
      p_evidence: consent.marketing.evidence ?? MARKETING_CONSENT_METHODS[consent.marketing.method],
    });
  }
  return { contactId, serviceId: service.id };
}
