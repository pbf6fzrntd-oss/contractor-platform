import "server-only";
import { getIndustry } from "@/lib/industries";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * When a business picks an industry served by a module (e.g. pest control →
 * Recurring Home Services), that module is switched on as part of its edition.
 * Home Services stays on too, and nothing is ever switched off here.
 */
export async function enableModuleForIndustry(db: AdminClient, orgId: string, industryKey: string | null): Promise<string | null> {
  const industry = getIndustry(industryKey);
  if (!industry || industry.module === "home_services" || industry.status !== "available") return null;
  await db.from("org_modules").upsert({ org_id: orgId, module: industry.module, enabled: true, source: "edition" }, { onConflict: "org_id,module", ignoreDuplicates: true });
  await db.from("organizations").update({ edition: industry.module }).eq("id", orgId).eq("edition", "home_services");
  return industry.module;
}
