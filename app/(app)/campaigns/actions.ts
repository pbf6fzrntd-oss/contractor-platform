"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import type { CampaignAudience } from "@/lib/automation/recipients";
import { hasFeature } from "@/lib/entitlements";
import { scheduleCampaign as scheduleCampaignService } from "@/lib/services/campaigns";
import { cancelPending, runDispatch } from "@/lib/services/outbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUnknownVariables } from "@/lib/templates/render";
import { zonedTimeToUtc } from "@/lib/time";

export async function scheduleCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org, plan, userId } = await requireAppContext("/campaigns");
  if (!hasFeature(plan, "campaigns")) return { error: "Your plan doesn't include campaigns." };

  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const bodyEn = String(formData.get("body_en") ?? "").trim();
  const bodyEs = String(formData.get("body_es") ?? "").trim();
  if (!name) return { error: "Give the campaign a name." };
  if (!bodyEn) return { error: "Write the message." };
  for (const body of [bodyEn, bodyEs]) {
    const unknown = findUnknownVariables(body);
    if (unknown.length) return { error: `Unknown placeholder {${unknown[0]}}. Check the spelling.` };
    if (body && !body.includes("{business_name}")) return { error: "Keep {business_name} in the message so customers know who it's from." };
  }

  const statuses = formData.getAll("statuses").map(String).filter((s): s is "active" | "past" => s === "active" || s === "past");
  if (statuses.length === 0) return { error: "Pick who should get it." };
  const serviceTypes = formData.getAll("service_types").map(String).filter(Boolean);
  const audience: CampaignAudience = { statuses, serviceTypes };

  const when = String(formData.get("when") ?? "now");
  let requested = new Date();
  if (when === "later") {
    const date = String(formData.get("send_date") ?? "");
    const time = String(formData.get("send_time") ?? "10:00");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return { error: "Pick a date and time." };
    const [h, m] = time.split(":").map(Number);
    requested = zonedTimeToUtc(date, h, m, org.timezone);
    if (requested.getTime() < Date.now() - 60_000) return { error: "Pick a time in the future." };
  }
  const db = createAdminClient();
  const result = await scheduleCampaignService(db, org, {
    name,
    templateKey: String(formData.get("template_key") ?? "") || null,
    bodyEn,
    bodyEs: bodyEs || null,
    audience,
    requestedAt: requested,
    userId,
  });
  const sendAt = result.sendAt;
  if (result.recipients === 0) return { error: "Nobody in that group has given written consent to receive offers." };

  if (sendAt.getTime() <= Date.now()) {
    after(async () => {
      try {
        await runDispatch(db, { broadcastId: result.broadcastId });
      } catch (e) {
        console.error("campaign dispatch failed", e);
      }
    });
  }
  revalidatePath("/campaigns");
  redirect(`/campaigns/${result.broadcastId}`);
}

export async function cancelCampaign(id: string): Promise<void> {
  const { org } = await requireAppContext("/campaigns");
  const db = createAdminClient();
  const { data } = await db.from("broadcasts").select("id").eq("id", id).eq("org_id", org.id).maybeSingle();
  if (!data) return;
  await db.from("broadcasts").update({ status: "canceled" }).eq("id", id);
  await cancelPending(db, { orgId: org.id, broadcastId: id }, "broadcast_canceled");
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
}
