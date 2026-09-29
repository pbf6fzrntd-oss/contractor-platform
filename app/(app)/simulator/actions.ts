"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { normalizeUSPhone } from "@/lib/phone";
import { handleInboundSms, handleMissedCall, type BusinessLine } from "@/lib/services/inbound";
import { runDispatch } from "@/lib/services/outbox";
import { createAdminClient } from "@/lib/supabase/admin";

/** The simulator only works with a pretend (simulator) business number. */
async function simulatorLine(): Promise<BusinessLine | { error: string }> {
  const { org } = await requireAppContext();
  const db = createAdminClient();
  const { data: phone } = await db
    .from("phone_numbers")
    .select("*")
    .eq("org_id", org.id)
    .eq("provider", "simulator")
    .limit(1)
    .maybeSingle();
  if (!phone) return { error: "Get a pretend business number first (Settings → Phone number)." };
  const { data: fullOrg } = await db.from("organizations").select("*").eq("id", org.id).single();
  return { phone, org: fullOrg! };
}

function callerPhone(formData: FormData) {
  return normalizeUSPhone(String(formData.get("from") ?? ""));
}

export async function simulateMissedCall(_prev: FormState, formData: FormData): Promise<FormState> {
  const line = await simulatorLine();
  if ("error" in line) return { error: line.error };
  const from = callerPhone(formData);
  if (!from) return { error: "Enter a valid customer phone number." };

  const result = await handleMissedCall(createAdminClient(), line, { from, callSid: `SIMCA${randomUUID()}` });
  revalidatePath("/simulator");
  return {
    success: result.texted ? "Missed call logged and the caller was texted." : `Missed call logged. No auto-text (${result.reason}).`,
  };
}

export async function simulateInboundText(_prev: FormState, formData: FormData): Promise<FormState> {
  const line = await simulatorLine();
  if ("error" in line) return { error: line.error };
  const from = callerPhone(formData);
  const body = String(formData.get("body") ?? "").trim();
  if (!from) return { error: "Enter a valid customer phone number." };
  if (!body) return { error: "Type a message." };

  await handleInboundSms(createAdminClient(), line, { from, body, messageSid: `SIMSM${randomUUID()}` });
  revalidatePath("/simulator");
  return { success: "Text received." };
}

/** Sends this business's scheduled texts now. `skipAhead` also sends ones scheduled for later. */
export async function runSimulatedScheduler(skipAhead: boolean): Promise<FormState> {
  const line = await simulatorLine();
  if ("error" in line) return { error: line.error };
  const summary = await runDispatch(createAdminClient(), { fastForwardOrgId: line.org.id, dueOnly: !skipAhead });
  revalidatePath("/simulator");
  return {
    success: `Sent ${summary.sent}, skipped ${summary.skipped}${summary.deferred ? `, waiting ${summary.deferred}` : ""}${summary.failed ? `, failed ${summary.failed}` : ""}.`,
  };
}
