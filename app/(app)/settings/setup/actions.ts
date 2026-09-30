"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

/** Hides (or brings back) the "Finish setting up" card. */
export async function setSetupHidden(hidden: boolean): Promise<void> {
  const { org } = await requireOwner();
  await (await createClient()).from("organizations").update({ setup_dismissed_at: hidden ? new Date().toISOString() : null }).eq("id", org.id);
  revalidatePath("/", "layout");
}
