import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";
import { localDateString } from "@/lib/time";

/** Pause, resume and cancel recurring service. Shared by the Customers screens and the AI assistant. */

export async function pauseService(db: AdminClient, orgId: string, serviceId: string, until: string | null): Promise<boolean> {
  const { data } = await db
    .from("recurring_services")
    .update({ status: "paused", paused_until: until })
    .eq("id", serviceId)
    .eq("org_id", orgId)
    .select("id");
  return Boolean(data?.length);
}

export async function resumeService(db: AdminClient, orgId: string, serviceId: string): Promise<boolean> {
  const { data } = await db
    .from("recurring_services")
    .update({ status: "active", paused_until: null, canceled_on: null, cancel_reason: null })
    .eq("id", serviceId)
    .eq("org_id", orgId)
    .select("id");
  return Boolean(data?.length);
}

export async function cancelService(
  db: AdminClient,
  orgId: string,
  serviceId: string,
  reason: string | null,
  timezone: string,
): Promise<boolean> {
  const { data } = await db
    .from("recurring_services")
    .update({ status: "canceled", paused_until: null, canceled_on: localDateString(new Date(), timezone), cancel_reason: reason })
    .eq("id", serviceId)
    .eq("org_id", orgId)
    .select("id");
  return Boolean(data?.length);
}
