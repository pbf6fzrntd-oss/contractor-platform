"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { validateBookingSettings } from "@/lib/booking/settings";
import { requireOwner } from "@/lib/auth/context";
import { canUse } from "@/lib/entitlements";
import { getIndustry } from "@/lib/industries";
import { BOOKING_MODES, type BookingMode } from "@/lib/industries/types";
import { parseDollars } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const done = () => {
  revalidatePath("/settings/booking");
  revalidatePath("/", "layout");
};

export async function saveBookingSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org, plan, modules } = await requireOwner();
  if (!canUse(plan, modules, "booking")) return { error: "Online booking is part of the Executive plan or the Agent Ready add-on." };
  const num = (k: string) => Number(formData.get(k));
  const result = validateBookingSettings({
    openDays: formData.getAll("openDays").map(Number),
    openHour: num("openHour"),
    closeHour: num("closeHour"),
    windowMinutes: num("windowMinutes"),
    windowCapacity: num("windowCapacity"),
    stepMinutes: num("stepMinutes"),
    maxDaysAhead: num("maxDaysAhead"),
    serviceZips: String(formData.get("serviceZips") ?? "").split(/[\s,]+/).filter(Boolean),
  });
  if ("error" in result) return { error: result.error };
  const { error } = await (await createClient())
    .from("organizations")
    .update({ booking_enabled: formData.get("booking_enabled") === "on", booking_settings: result.settings })
    .eq("id", org.id);
  if (error) return { error: "Couldn't save. Please try again." };
  done();
  return { success: "Saved." };
}

/** Adds the industry's usual services (skipping ones already added), as a starting point. */
export async function addIndustryServices(): Promise<void> {
  const { org } = await requireOwner();
  const industry = getIndustry(org.industry);
  if (!industry) return;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("service_catalog").select("key").eq("org_id", org.id);
  const have = new Set((existing ?? []).map((s) => s.key));
  const rows = industry.services
    .filter((s) => !have.has(s.key) && s.bookingMode && s.bookingMode !== "recurring")
    .map((s, i) => ({
      org_id: org.id,
      key: s.key,
      name: s.name.en,
      name_es: s.name.es,
      booking_mode: s.bookingMode!,
      duration_minutes: s.durationMinutes ?? 60,
      daily_capacity: s.bookingMode === "day_capacity" ? 2 : null,
      unit_class: s.bookingMode === "multi_day_reservation" ? "standard" : null,
      price_from_cents: s.priceFromCents ?? null,
      price_to_cents: s.priceToCents ?? null,
      price_unit: s.unit ?? null,
      required_documents: industry.subjectType === "pet" ? ["rabies"] : [],
      sort_order: i,
    }));
  if (rows.length) await supabase.from("service_catalog").insert(rows);
  done();
}

export async function addService(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const mode = String(formData.get("booking_mode"));
  if (!name) return { error: "Name the service." };
  if (!(BOOKING_MODES as readonly string[]).includes(mode) || mode === "recurring") return { error: "Pick how it's booked." };
  const duration = Number(formData.get("duration_minutes") || 60);
  if (!Number.isInteger(duration) || duration < 5 || duration > 1440) return { error: "Length must be between 5 minutes and 24 hours." };
  const daily = Number(formData.get("daily_capacity") || 0);
  const from = parseDollars(String(formData.get("price_from") ?? ""));
  const to = parseDollars(String(formData.get("price_to") ?? ""));
  const docs = String(formData.get("required_documents") ?? "")
    .split(/[\s,]+/)
    .map((d) => d.toLowerCase().replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean)
    .slice(0, 5);
  const { error } = await (await createClient()).from("service_catalog").insert({
    org_id: org.id,
    name,
    booking_mode: mode as BookingMode,
    duration_minutes: duration,
    daily_capacity: mode === "day_capacity" ? Math.max(1, daily || 1) : null,
    resource_kind: String(formData.get("resource_kind") ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "") || null,
    unit_class: mode === "multi_day_reservation" ? String(formData.get("unit_class") ?? "standard").toLowerCase().replace(/[^a-z_]/g, "") || "standard" : null,
    price_from_cents: from ?? null,
    price_to_cents: to ?? null,
    required_documents: docs,
    min_notice_hours: Math.max(0, Math.min(720, Number(formData.get("min_notice_hours") || 0))),
  });
  if (error) return { error: "Couldn't add the service. Check the values and try again." };
  done();
  return { success: "Service added." };
}

export async function setServiceActive(id: string, active: boolean): Promise<void> {
  const { org } = await requireOwner();
  await (await createClient()).from("service_catalog").update({ active }).eq("id", id).eq("org_id", org.id);
  done();
}

export async function addResource(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const kind = String(formData.get("kind") ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
  if (!name || !kind) return { error: "Give it a name and a type (e.g. Sam, groomer)." };
  const capacity = Math.max(1, Math.min(200, Number(formData.get("capacity") || 1)));
  const unitClass = String(formData.get("unit_class") ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "") || null;
  const { error } = await (await createClient()).from("resources").insert({ org_id: org.id, name, kind, capacity, unit_class: unitClass });
  if (error) return { error: "Couldn't add it. Please try again." };
  done();
  return { success: "Added." };
}

export async function setResourceActive(id: string, active: boolean): Promise<void> {
  const { org } = await requireOwner();
  await (await createClient()).from("resources").update({ active }).eq("id", id).eq("org_id", org.id);
  done();
}
