"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireModule } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { localDateString } from "@/lib/time";
import { MODULE_ID, queueRenewalReminder } from "@/modules/recurring-home/agreements";
import { nextTerm } from "@/modules/recurring-home/rules/agreements";
import { parseAgreementForm } from "@/modules/recurring-home/rules/form";

/** Adds or updates a service agreement (office managers can too: it's daily work). */
export async function saveAgreement(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const { org, userId } = await requireModule(MODULE_ID);
  const parsed = parseAgreementForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.value;
  const supabase = await createClient();
  // The customer and route must belong to this business (row-level security hides everyone else's).
  const { data: contact } = await supabase.from("contacts").select("id").eq("id", v.contact_id).eq("org_id", org.id).maybeSingle();
  if (!contact) return { error: "Pick a customer." };
  if (v.recurring_service_id) {
    const { data: svc } = await supabase.from("recurring_services").select("id").eq("id", v.recurring_service_id).eq("contact_id", v.contact_id).maybeSingle();
    if (!svc) return { error: "That service isn't this customer's." };
  }
  if (id) {
    const { data, error } = await supabase.from("rh_agreements").update(v).eq("id", id).eq("org_id", org.id).select("id");
    if (error || !data?.length) return { error: "Couldn't save. Please try again." };
    revalidatePath("/agreements");
    return { success: "Saved." };
  }
  const { data, error } = await supabase.from("rh_agreements").insert({ ...v, org_id: org.id, created_by: userId }).select("id").single();
  if (error || !data) return { error: "Couldn't save. Please try again." };
  revalidatePath("/agreements");
  redirect(`/agreements/${data.id}?saved=1`);
}

async function load(id: string) {
  const { org } = await requireModule(MODULE_ID);
  const supabase = await createClient();
  const { data } = await supabase.from("rh_agreements").select("*").eq("id", id).eq("org_id", org.id).maybeSingle();
  return data ? { org, supabase, a: data } : null;
}

/** Starts the next term now (e.g. the customer said YES to renewing). */
export async function renewAgreement(id: string): Promise<void> {
  const r = await load(id);
  if (!r) return;
  const term = nextTerm(r.a, localDateString(new Date(), r.org.timezone));
  await r.supabase.from("rh_agreements").update({ ends_on: term.ends_on, status: "active" }).eq("id", id);
  revalidatePath(`/agreements/${id}`);
}

export async function setAgreementStatus(id: string, status: "active" | "ended" | "canceled"): Promise<void> {
  const r = await load(id);
  if (!r) return;
  await r.supabase.from("rh_agreements").update({ status }).eq("id", id);
  revalidatePath(`/agreements/${id}`);
}

/** Texts the customer their renewal reminder now (business hours and opt-outs still apply). */
export async function sendRenewalReminderNow(id: string): Promise<FormState> {
  const r = await load(id);
  if (!r) return { error: "Agreement not found." };
  if (!r.a.ends_on) return { error: "This agreement has no end date, so there's nothing to renew." };
  const ok = await queueRenewalReminder(createAdminClient(), r.org, r.a);
  revalidatePath(`/agreements/${id}`);
  return ok ? { success: "Reminder queued. It goes out in business hours." } : { error: "Couldn't queue the reminder. Please try again." };
}

export async function deleteAgreement(id: string): Promise<void> {
  const r = await load(id);
  if (!r) return;
  // Only owners can delete (row-level security); managers can end or cancel instead.
  await r.supabase.from("rh_agreements").delete().eq("id", id);
  redirect("/agreements");
}
