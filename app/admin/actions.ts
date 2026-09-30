"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePlatformAdmin } from "@/lib/auth/admin";
import { REGISTRATION_STATUS_TEXT } from "@/lib/automation/a2p";
import { getIndustry } from "@/lib/industries";
import { MODULE_IDS } from "@/lib/industries/types";
import { normalizeUSPhone } from "@/lib/phone";
import { notifyOwner } from "@/lib/services/conversations";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["not_started", "submitted", "in_review", "approved", "rejected"];

export async function updateRegistration(orgId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const status = String(formData.get("status"));
  if (!STATUSES.includes(status)) return { error: "Pick a status." };
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;

  const { data: before } = await db.from("a2p_registrations").select("status").eq("org_id", orgId).single();
  await db
    .from("a2p_registrations")
    .update({
      status,
      twilio_brand_sid: s("twilio_brand_sid"),
      twilio_campaign_sid: s("twilio_campaign_sid"),
      admin_notes: s("admin_notes"),
      ...(status === "approved" || status === "rejected" ? { decided_at: new Date().toISOString() } : {}),
    })
    .eq("org_id", orgId);

  const messagingServiceSid = s("messaging_service_sid");
  await db.from("phone_numbers").update({ messaging_service_sid: messagingServiceSid }).eq("org_id", orgId);

  if (before?.status !== status) {
    await notifyOwner(db, orgId, {
      kind: "system",
      body: `Carrier registration: ${REGISTRATION_STATUS_TEXT[status]}.`,
      link: "/settings/registration",
    });
  }
  revalidatePath(`/admin/${orgId}`);
  return { success: "Saved." };
}

export async function updateAccount(orgId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const planId = String(formData.get("plan_id"));
  const { data: plan } = await db.from("plans").select("id").eq("id", planId).maybeSingle();
  if (!plan) return { error: "Unknown plan." };
  await db.from("organizations").update({ plan_id: planId }).eq("id", orgId);
  if (formData.get("manual_billing") === "on") {
    await db.from("subscriptions").upsert({ org_id: orgId, status: "manual" });
  }
  revalidatePath(`/admin/${orgId}`);
  return { success: "Saved." };
}

/** For numbers you bought yourself in the Twilio console. */
export async function assignNumber(orgId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const e164 = normalizeUSPhone(String(formData.get("e164") ?? ""));
  if (!e164) return { error: "Enter a valid US number." };
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("alert_phone").eq("id", orgId).single();
  const { error } = await db.from("phone_numbers").insert({
    org_id: orgId,
    e164,
    provider: "twilio",
    provider_sid: String(formData.get("provider_sid") ?? "").trim() || null,
    forward_to: org?.alert_phone ?? null,
  });
  if (error) return { error: "Couldn't assign it. Is that number already used by another business?" };
  revalidatePath(`/admin/${orgId}`);
  return { success: "Number assigned. Set its webhooks in Twilio (see README)." };
}

export async function updatePlan(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const price = Number(formData.get("monthly_price"));
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a monthly price." };
  const n = (k: string) => Math.max(0, Math.round(Number(formData.get(k)) || 0));
  const db = createAdminClient();
  const { error } = await db
    .from("plans")
    .update({
      monthly_price_cents: Math.round(price * 100),
      stripe_price_id: String(formData.get("stripe_price_id") ?? "").trim() || null,
      max_users: n("max_users"),
      monthly_sms_limit: n("monthly_sms_limit"),
    })
    .eq("id", planId);
  if (error) return { error: "Couldn't save." };
  revalidatePath("/admin/plans");
  return { success: "Saved." };
}

/** Switches a module or add-on on/off for one business (e.g. a pilot, or a module included with Executive). */
export async function setOrgModule(orgId: string, moduleKey: string, enabled: boolean): Promise<void> {
  await requirePlatformAdmin();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(moduleKey)) return;
  const db = createAdminClient();
  const { data: existing } = await db.from("org_modules").select("source").eq("org_id", orgId).eq("module", moduleKey).maybeSingle();
  await db.from("org_modules").upsert({ org_id: orgId, module: moduleKey, enabled, source: existing?.source ?? "admin" });
  revalidatePath(`/admin/${orgId}`);
}

/** Sets a business's industry (any, including coming-soon ones for pilots) and edition. */
export async function updateOrgIndustry(orgId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const industryKey = String(formData.get("industry") ?? "");
  const edition = String(formData.get("edition") ?? "home_services");
  const industry = industryKey ? getIndustry(industryKey) : null;
  if (industryKey && !industry) return { error: "Unknown industry." };
  if (!(MODULE_IDS as readonly string[]).includes(edition)) return { error: "Unknown edition." };
  const update: { industry: string | null; edition: string; business_type?: string } = { industry: industry?.key ?? null, edition };
  if (industry) update.business_type = industry.businessType;
  await createAdminClient().from("organizations").update(update).eq("id", orgId);
  revalidatePath(`/admin/${orgId}`);
  return { success: "Saved." };
}

export async function updateAddon(key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformAdmin();
  const price = Number(formData.get("monthly_price"));
  if (!Number.isFinite(price) || price < 0) return { error: "Enter a monthly price." };
  const status = formData.get("status") === "available" ? "available" : "coming_soon";
  const { error } = await createAdminClient()
    .from("addon_catalog")
    .update({ monthly_price_cents: Math.round(price * 100), stripe_price_id: String(formData.get("stripe_price_id") ?? "").trim() || null, status })
    .eq("key", key);
  if (error) return { error: "Couldn't save (is that Stripe price already used?)." };
  revalidatePath("/admin/plans");
  return { success: "Saved." };
}
