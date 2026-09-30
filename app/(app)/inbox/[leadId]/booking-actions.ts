"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { createBooking } from "@/lib/services/booking";
import { loadLeadForUser } from "@/lib/services/leads";
import { createAdminClient } from "@/lib/supabase/admin";

/** Books a visit for this lead's customer through the shared booking engine. */
export async function bookForLead(leadId: string, serviceId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  if (!ctx.org.booking_enabled) return { error: "Turn on booking in Settings → Online booking first." };
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const subjectId = str("subject_id");
  if (subjectId) {
    const { data: own } = await loaded.supabase.from("subjects").select("id").eq("id", subjectId).eq("contact_id", loaded.contact.id).maybeSingle();
    if (!own) return { error: "Pick one of this customer's records." };
  }
  const start = Number(str("start_ms"));
  const result = await createBooking(createAdminClient(), ctx.org, {
    serviceId,
    contactId: loaded.contact.id,
    leadId,
    subjectId: subjectId ?? null,
    startMs: Number.isFinite(start) && start > 0 ? start : undefined,
    date: str("date"),
    checkIn: str("check_in"),
    checkOut: str("check_out"),
    zip: str("zip") ?? null,
    address: loaded.contact.address,
    source: ctx.role === "owner" ? "owner" : "team",
    userId: ctx.userId,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/inbox/${leadId}`);
  revalidatePath("/schedule");
  redirect(`/inbox/${leadId}?booked=1`);
}
