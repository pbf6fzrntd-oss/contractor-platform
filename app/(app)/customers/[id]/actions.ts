"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { FREQUENCIES } from "@/lib/automation/schedule";
import { parseDollars } from "@/lib/format";
import { MARKETING_CONSENT_METHODS } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";

async function loadService(id: string) {
  const ctx = await requireAppContext("/customers");
  const supabase = await createClient();
  const { data: service } = await supabase
    .from("recurring_services")
    .select("*")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  return service ? { ctx, supabase, service } : null;
}

function done(id: string) {
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  revalidatePath("/today");
}

export async function updateService(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadService(id);
  if (!loaded) return { error: "Customer not found." };
  const frequency = String(formData.get("frequency"));
  const day = Number(formData.get("service_day"));
  const price = parseDollars(formData.get("price")?.toString());
  const serviceType = String(formData.get("service_type") ?? "").trim().slice(0, 60);
  const startDate = String(formData.get("start_date") ?? "");
  if (!serviceType || !(FREQUENCIES as readonly string[]).includes(frequency) || !(day >= 0 && day <= 6)) {
    return { error: "Check the service details." };
  }
  if (price === undefined) return { error: "Enter the price as a dollar amount." };
  const { error } = await loaded.supabase
    .from("recurring_services")
    .update({
      service_type: serviceType,
      frequency,
      service_day: day,
      price_cents: price,
      ...(/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? { start_date: startDate } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Couldn't save." };
  done(id);
  return { success: "Saved." };
}

export async function pauseService(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadService(id);
  if (!loaded) return { error: "Customer not found." };
  const until = String(formData.get("paused_until") ?? "");
  const today = localDateString(new Date(), loaded.ctx.org.timezone);
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= today)) return { error: "Pick a resume date in the future." };
  await loaded.supabase.from("recurring_services").update({ status: "paused", paused_until: until || null }).eq("id", id);
  done(id);
  return { success: until ? "Paused. They'll be back on the schedule automatically." : "Paused." };
}

export async function resumeService(id: string): Promise<void> {
  const loaded = await loadService(id);
  if (!loaded) return;
  await loaded.supabase.from("recurring_services").update({ status: "active", paused_until: null, canceled_on: null, cancel_reason: null }).eq("id", id);
  done(id);
}

export async function cancelService(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadService(id);
  if (!loaded) return { error: "Customer not found." };
  const reason = String(formData.get("cancel_reason") ?? "").slice(0, 300) || null;
  await loaded.supabase
    .from("recurring_services")
    .update({
      status: "canceled",
      paused_until: null,
      canceled_on: localDateString(new Date(), loaded.ctx.org.timezone),
      cancel_reason: reason,
    })
    .eq("id", id);
  done(id);
  return { success: "Canceled." };
}

export async function recordMarketingConsent(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadService(id);
  if (!loaded) return { error: "Customer not found." };
  const method = String(formData.get("marketing_method") ?? "");
  if (!(method in MARKETING_CONSENT_METHODS)) return { error: "Pick how they agreed." };
  const note = String(formData.get("marketing_evidence") ?? "").trim().slice(0, 500);
  const { error } = await loaded.supabase.rpc("record_consent_event", {
    p_org_id: loaded.ctx.org.id,
    p_contact_id: loaded.service.contact_id,
    p_kind: "marketing_granted",
    p_method: method,
    p_evidence: note || MARKETING_CONSENT_METHODS[method as keyof typeof MARKETING_CONSENT_METHODS],
  });
  if (error) return { error: "Couldn't save." };
  done(id);
  return { success: "Marketing consent recorded." };
}

export async function revokeMarketingConsent(id: string): Promise<void> {
  const loaded = await loadService(id);
  if (!loaded) return;
  await loaded.supabase.rpc("record_consent_event", {
    p_org_id: loaded.ctx.org.id,
    p_contact_id: loaded.service.contact_id,
    p_kind: "marketing_revoked",
    p_method: "owner_recorded",
    p_evidence: "Owner removed marketing consent.",
  });
  done(id);
}

/** Opens (or starts) the text conversation with this customer. */
export async function openConversation(id: string): Promise<void> {
  const loaded = await loadService(id);
  if (!loaded) return;
  const { supabase, ctx, service } = loaded;
  const { data: open } = await supabase
    .from("leads")
    .select("id")
    .eq("org_id", ctx.org.id)
    .eq("contact_id", service.contact_id)
    .in("stage", ["new", "contacted", "estimate_sent"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/inbox/${open.id}`);
  const { data: lead } = await supabase
    .from("leads")
    .insert({ org_id: ctx.org.id, contact_id: service.contact_id, source: "manual", stage: "contacted" })
    .select("id")
    .single();
  redirect(`/inbox/${lead!.id}`);
}
