"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { parseSettings } from "@/lib/settings";
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
  if (days.length === 0 || days.length > 5 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 60)) {
    return { error: "Follow-up days should be up to 5 whole numbers between 1 and 60, like 2, 5, 10." };
  }
  const start = int(formData, "businessHoursStart");
  const end = int(formData, "businessHoursEnd");
  if (!(start >= 7 && start <= 12 && end >= 15 && end <= 21)) return { error: "Pick business hours from the lists." };
  const reviewDelayHours = int(formData, "reviewDelayHours");
  if (!(reviewDelayHours >= 0 && reviewDelayHours <= 72)) return { error: "Review delay must be 0–72 hours." };
  const reviewAfterVisits = int(formData, "reviewAfterVisits");
  if (!(reviewAfterVisits >= 1 && reviewAfterVisits <= 20)) return { error: "Visits before a review request: 1–20." };

  const settings = parseSettings({
    ...parseSettings(org.settings),
    missedCallTextEnabled: formData.get("missedCallTextEnabled") === "on",
    followUpsEnabled: formData.get("followUpsEnabled") === "on",
    followUpDays: days,
    followUpHour: int(formData, "followUpHour"),
    stopFollowUpsOnReply: formData.get("stopFollowUpsOnReply") === "on",
    reviewsEnabled: formData.get("reviewsEnabled") === "on",
    reviewDelayHours,
    reviewAfterVisits,
    businessHoursStart: start,
    businessHoursEnd: end,
  });

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ settings }).eq("id", org.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings/automations");
  return { success: "Saved. Changes apply to texts scheduled from now on." };
}
