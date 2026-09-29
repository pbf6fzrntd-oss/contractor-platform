"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { SERVICE_NOTICE_WINDOW } from "@/lib/automation/compliance";
import { hasFeature } from "@/lib/entitlements";
import { createServiceNotice, markDayComplete } from "@/lib/services/broadcasts";
import { runDispatch } from "@/lib/services/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUnknownVariables } from "@/lib/templates/render";
import { isWithinWindow } from "@/lib/time";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function sendNotice(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org, plan, userId } = await requireAppContext("/today");
  if (!hasFeature(plan, "bulk_messaging")) return { error: "Your plan doesn't include bulk texts." };

  const type = String(formData.get("type"));
  const date = String(formData.get("date"));
  const newDate = String(formData.get("new_date") ?? "");
  const bodyEn = String(formData.get("body_en") ?? "").trim();
  const bodyEs = String(formData.get("body_es") ?? "").trim();
  if (!isDate(date)) return { error: "Pick the day." };
  if (type === "rain_delay" && (!isDate(newDate) || newDate <= date)) return { error: "Pick the new day." };
  if (!bodyEn) return { error: "Write the message." };
  for (const body of [bodyEn, bodyEs]) {
    const unknown = findUnknownVariables(body);
    if (unknown.length) return { error: `Unknown placeholder {${unknown[0]}}. Check the spelling.` };
  }

  const db = createAdminClient();
  const result = await createServiceNotice(db, org.id, {
    name: type === "rain_delay" ? "Rain delay" : type === "running_late" ? "Running late" : "Message to today's customers",
    templateKey: type === "custom" ? null : type,
    bodyEn,
    bodyEs: bodyEs || null,
    date,
    newDate: type === "rain_delay" ? newDate : null,
    userId,
  });

  // Start sending right away (the every-minute scheduler picks up anything left).
  if (isWithinWindow(new Date(), org.timezone, SERVICE_NOTICE_WINDOW)) {
    after(async () => {
      try {
        await runDispatch(db, { broadcastId: result.broadcastId });
      } catch (e) {
        console.error("notice dispatch failed", e);
      }
    });
  }
  revalidatePath("/today");
  redirect(`/today?date=${date}&sent=${result.broadcastId}`);
}

export async function completeDay(date: string, _prev: FormState): Promise<FormState> {
  const { org, userId } = await requireAppContext("/today");
  if (!isDate(date)) return { error: "Pick a day." };
  const result = await markDayComplete(createAdminClient(), org.id, date, userId);
  revalidatePath("/today");
  if (result.visits === 0) return { success: "Everyone for this day was already marked done." };
  return {
    success: `Marked ${result.visits} visit${result.visits === 1 ? "" : "s"} done.${
      result.reviewsScheduled ? ` ${result.reviewsScheduled} review request${result.reviewsScheduled === 1 ? "" : "s"} scheduled.` : ""
    }`,
  };
}
