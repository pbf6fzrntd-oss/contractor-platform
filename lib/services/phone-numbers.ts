import "server-only";
import { serverEnv } from "@/lib/env";
import { getProvider } from "@/lib/messaging/provider";
import type { AdminClient } from "@/lib/supabase/admin";

/** Gets a new local number for a business (a fake 555 number in simulator mode). */
export async function provisionBusinessNumber(
  db: AdminClient,
  orgId: string,
  areaCode: string,
): Promise<{ error?: string }> {
  const { count } = await db.from("phone_numbers").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  const { data: org } = await db.from("organizations").select("plan_id, alert_phone").eq("id", orgId).single();
  const { data: plan } = await db.from("plans").select("max_phone_numbers").eq("id", org!.plan_id).single();
  if ((count ?? 0) >= (plan?.max_phone_numbers ?? 1)) {
    return { error: "Your plan already has its phone number." };
  }

  const provider = getProvider();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const number = await provider.buyNumber(areaCode || serverEnv.defaultAreaCode);
      const { error } = await db.from("phone_numbers").insert({
        org_id: orgId,
        e164: number.e164,
        provider: provider.name,
        provider_sid: number.sid,
        forward_to: org?.alert_phone ?? null,
      });
      if (!error) return {};
      if (provider.name === "twilio") return { error: "Bought the number but couldn't save it. Contact support." };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't get a number. Try again." };
    }
  }
  return { error: "Couldn't get a number. Try again." };
}
