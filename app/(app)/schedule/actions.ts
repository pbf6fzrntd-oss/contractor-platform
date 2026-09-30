"use server";

import { revalidatePath } from "next/cache";
import { requireAppContext } from "@/lib/auth/context";
import { completeJobForLead } from "@/lib/services/lead-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: Record<string, string[]> = {
  confirm: ["requested", "pending_approval"],
  start: ["confirmed"],
  complete: ["confirmed", "in_progress"],
  no_show: ["confirmed"],
  cancel: ["requested", "pending_approval", "confirmed"],
};
const TO: Record<string, string> = { confirm: "confirmed", start: "in_progress", complete: "completed", no_show: "no_show", cancel: "canceled" };

/** Moves a booking along (confirm, done, no-show, cancel). "Done" also records the job, like the lead page does. */
export async function changeBookingStatus(bookingId: string, action: keyof typeof TO): Promise<void> {
  const ctx = await requireAppContext();
  const supabase = await createClient();
  const { data: b } = await supabase
    .from("bookings")
    .update({ status: TO[action] })
    .eq("id", bookingId)
    .eq("org_id", ctx.org.id)
    .in("status", ALLOWED[action] ?? [])
    .select("id, lead_id, price_cents, service_id")
    .maybeSingle();
  if (b && action === "complete" && b.lead_id) {
    const { data: svc } = b.service_id ? await supabase.from("service_catalog").select("name").eq("id", b.service_id).maybeSingle() : { data: null };
    await completeJobForLead(createAdminClient(), ctx.org.id, b.lead_id, { amountCents: null, description: svc?.name ?? null, userId: ctx.userId });
  }
  revalidatePath("/schedule");
}
