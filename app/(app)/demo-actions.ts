"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { demoInboundText, demoMissedCall, demoSkipAhead } from "@/lib/services/demo-live";
import { createAdminClient } from "@/lib/supabase/admin";

async function demoOrg() {
  const { org } = await requireAppContext();
  return org.is_demo ? org : null;
}

export async function tryMissedCall(): Promise<FormState> {
  const org = await demoOrg();
  if (!org) return { error: "Only in demo businesses." };
  const leadId = await demoMissedCall(createAdminClient(), org.id);
  if (!leadId) return { error: "Couldn't start that. Refresh and try again." };
  redirect(`/inbox/${leadId}?tried=missed_call`);
}

export async function tryInboundText(spanish: boolean): Promise<FormState> {
  const org = await demoOrg();
  if (!org) return { error: "Only in demo businesses." };
  const leadId = await demoInboundText(createAdminClient(), org.id, spanish);
  if (!leadId) return { error: "Couldn't start that. Refresh and try again." };
  redirect(`/inbox/${leadId}?tried=text`);
}

export async function trySkipAhead(): Promise<FormState> {
  const org = await demoOrg();
  if (!org) return { error: "Only in demo businesses." };
  const s = await demoSkipAhead(createAdminClient(), org.id);
  revalidatePath("/", "layout");
  if (!s) return { error: "Couldn't start that. Refresh and try again." };
  return { success: s.sent ? `Jumped ahead: ${s.sent} automatic ${s.sent === 1 ? "text" : "texts"} went out (follow-ups, reminders, review requests).` : "Nothing was waiting to go out. Send an estimate first, then try again." };
}
