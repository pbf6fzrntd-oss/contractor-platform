"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { defaultTemplatesFor } from "@/lib/templates/defaults";
import { enableModuleForIndustry } from "@/lib/services/editions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseBusinessForm } from "@/lib/validation/business";

export async function updateBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const parsed = parseBusinessForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update(parsed.data).eq("id", org.id);
  if (error) {
    console.error("update organization failed", error);
    return { error: "Couldn't save your changes. Please try again." };
  }

  // Switching business type: add any default templates the new type needs,
  // without touching templates the owner already has.
  if (parsed.data.business_type !== org.business_type) {
    const rows = defaultTemplatesFor(parsed.data.business_type, parsed.data.industry).map((t) => ({ ...t, org_id: org.id }));
    await supabase.from("message_templates").upsert(rows, { onConflict: "org_id,key,language", ignoreDuplicates: true });
  }

  // Picking an industry served by a module (e.g. pest control) switches that module on.
  if ("industry" in parsed.data && parsed.data.industry !== org.industry) {
    await enableModuleForIndustry(createAdminClient(), org.id, parsed.data.industry ?? null);
  }

  revalidatePath("/", "layout");
  return { success: "Saved." };
}
