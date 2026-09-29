"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { applySettingsChanges, parseSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

function int(formData: FormData, name: string) {
  const n = Number(formData.get(name));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export async function saveAutomations(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();

  const days = String(formData.get("followUpDays") ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  const result = applySettingsChanges(parseSettings(org.settings), {
    missedCallTextEnabled: formData.get("missedCallTextEnabled") === "on",
    followUpsEnabled: formData.get("followUpsEnabled") === "on",
    followUpDays: days,
    followUpHour: int(formData, "followUpHour"),
    stopFollowUpsOnReply: formData.get("stopFollowUpsOnReply") === "on",
    reviewsEnabled: formData.get("reviewsEnabled") === "on",
    reviewDelayHours: int(formData, "reviewDelayHours"),
    reviewAfterVisits: int(formData, "reviewAfterVisits"),
    businessHoursStart: int(formData, "businessHoursStart"),
    businessHoursEnd: int(formData, "businessHoursEnd"),
  });
  if ("error" in result) return { error: result.error };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ settings: result.settings }).eq("id", org.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings/automations");
  return { success: "Saved. Changes apply to texts scheduled from now on." };
}
