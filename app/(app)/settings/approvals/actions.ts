"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { APPROVAL_RULE_KEYS, parseApprovalSettings } from "@/lib/approvals/rules";
import { requireOwner } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function saveApprovalRules(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const current = parseApprovalSettings(org.approval_settings);
  const next = Object.fromEntries(
    APPROVAL_RULE_KEYS.map((k) => {
      const raw = formData.get(`${k}_value`);
      const value = raw === null || raw === "" ? current[k].value : Number(raw);
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 10_000_000)) return [k, current[k]];
      // Rules not shown to this business keep their saved state.
      const shown = formData.has(`${k}_shown`);
      return [k, { on: shown ? formData.get(`${k}_on`) === "on" : current[k].on, ...(value !== undefined ? { value } : {}) }];
    }),
  );
  const { error } = await (await createClient()).from("organizations").update({ approval_settings: next }).eq("id", org.id);
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings/approvals");
  return { success: "Saved." };
}
