"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/context";
import { newCalendarToken } from "@/lib/services/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

/** Makes a new private calendar address (any old one stops working). */
export async function resetCalendarLink(): Promise<void> {
  const { org } = await requireOwner();
  await createAdminClient().from("organizations").update({ calendar_token: newCalendarToken() }).eq("id", org.id);
  revalidatePath("/settings/calendar");
}

/** Turns the calendar feed off. */
export async function turnOffCalendarLink(): Promise<void> {
  const { org } = await requireOwner();
  await createAdminClient().from("organizations").update({ calendar_token: null }).eq("id", org.id);
  revalidatePath("/settings/calendar");
}
