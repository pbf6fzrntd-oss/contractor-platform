"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { serverEnv } from "@/lib/env";
import { allowPublicRequest, visitorHash } from "@/lib/public/rate-limit";
import { createDemoBusiness, demoIndustries } from "@/lib/services/demo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getIndustry } from "@/lib/industries";
import { MODULES } from "@/modules/registry";

/** Makes a private demo business for this visitor and signs them into it. */
export async function startDemo(industry: string): Promise<FormState> {
  if (!serverEnv.demoMode) return { error: "The live demo is turned off." };
  if (!demoIndustries().some((i) => i.key === industry)) return { error: "Pick a trade." };
  const db = createAdminClient();
  if (!(await allowPublicRequest(db, null, visitorHash(await headers()), "demo"))) {
    return { error: "You've started a lot of demos. Please wait a bit and try again." };
  }
  let login;
  try {
    login = await createDemoBusiness(db, industry, new Date(), MODULES);
  } catch (e) {
    console.error("demo setup failed", e);
    return { error: "Couldn't set up the demo. Please try again." };
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
  if (error) return { error: "Couldn't open the demo. Please try again." };
  // Lawn companies start on Today (their route and rain delay); trades on the Inbox.
  redirect(getIndustry(industry)?.businessType === "recurring" ? "/today?welcome=1" : "/inbox?welcome=1");
}
