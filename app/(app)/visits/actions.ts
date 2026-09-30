"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireModule } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MODULE_ID } from "@/modules/recurring-home/agreements";
import { parseReportValues, reportFields } from "@/modules/recurring-home/rules/visit-report";
import { saveVisitReport } from "@/modules/recurring-home/visits";

/** Crew finishes a stop: checklist, readings, notes, photos, and the optional "service complete" text. */
export async function saveVisit(serviceId: string, date: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { org, userId } = await requireModule(MODULE_ID);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick the visit date." };
  // The customer must be this business's (row-level security).
  const { data: svc } = await (await createClient()).from("recurring_services").select("id").eq("id", serviceId).eq("org_id", org.id).maybeSingle();
  if (!svc) return { error: "Customer not found." };
  const parsed = parseReportValues(reportFields(org.industry), formData);
  if (!parsed.ok) return { error: parsed.error };
  const text = (k: string, max: number) => String(formData.get(k) ?? "").trim().slice(0, max) || null;
  const photos = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const result = await saveVisitReport(createAdminClient(), org, {
    recurringServiceId: serviceId,
    date,
    values: parsed.values,
    customerNote: text("customer_note", 500),
    privateNote: text("private_note", 2000),
    textCustomer: formData.get("text_customer") === "on",
    photos,
    userId,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/visits/${result.jobId}?saved=1&texted=${result.texted}`);
}
