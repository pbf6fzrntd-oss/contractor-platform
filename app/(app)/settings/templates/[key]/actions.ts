"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { LANGUAGES } from "@/lib/business-types";
import { saveTemplateText } from "@/lib/services/templates";
import { createClient } from "@/lib/supabase/server";
import { findDefaultTemplate, validateTemplateBody } from "@/lib/templates/validate";

export async function saveTemplate(key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext();
  const def = findDefaultTemplate(key, org.business_type);
  if (!def) return { error: "Unknown template." };

  const bodies = LANGUAGES.map((language) => ({ language, body: String(formData.get(`body_${language}`) ?? "").trim() }));
  for (const { language, body } of bodies) {
    const problem = validateTemplateBody(body, language, def);
    if (problem) return { error: problem };
  }

  const supabase = await createClient();
  for (const { language, body } of bodies) {
    if (!(await saveTemplateText(supabase, org.id, { key, language, body, category: def.category }))) {
      return { error: "Couldn't save. Please try again." };
    }
  }

  revalidatePath("/settings/templates");
  revalidatePath(`/settings/templates/${key}`);
  return { success: "Saved. New texts will use this wording." };
}
