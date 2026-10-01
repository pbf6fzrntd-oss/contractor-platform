import { validateDemoDeployment } from "@/lib/deployment";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Readiness reveals no records, credentials or internal error details. */
export async function GET() {
  try {
    if (validateDemoDeployment(process.env).length) throw new Error("configuration");
    const db = createAdminClient();
    const checks = await Promise.all([
      db.from("scheduled_messages").select("id").limit(1).abortSignal(AbortSignal.timeout(5000)),
      db.from("sms_attempts").select("request_key").limit(1).abortSignal(AbortSignal.timeout(5000)),
      ...(process.env.DEPLOYMENT_MODE === "demo" ? [db.from("organizations").select("id", { count: "exact", head: true }).eq("is_demo", false).abortSignal(AbortSignal.timeout(5000))] : []),
    ]);
    if (checks.some(c => c.error) || (checks[2]?.count ?? 0) > 0) throw new Error("database");
    return Response.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
