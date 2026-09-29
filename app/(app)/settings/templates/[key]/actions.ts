"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { LANGUAGES } from "@/lib/business-types";
import { DEFAULT_TEMPLATES } from "@/lib/templates/defaults";
import { findUnknownVariables } from "@/lib/templates/render";
import { createClient } from "@/lib/supabase/server";

export async function saveTemplate(key: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext();
  const def =
    DEFAULT_TEMPLATES.find((t) => t.key === key && t.businessTypes.includes(org.business_type)) ??
    DEFAULT_TEMPLATES.find((t) => t.key === key);
  if (!def) return { error: "Unknown template." };

  const supabase = await createClient();
  for (const language of LANGUAGES) {
    const body = String(formData.get(`body_${language}`) ?? "").trim();
    const name = language === "en" ? "English" : "Spanish";
    if (!body) return { error: `The ${name} text can't be empty.` };
    if (body.length > 1000) return { error: `The ${name} text is too long.` };
    const unknown = findUnknownVariables(body);
    if (unknown.length) {
      return { error: `The ${name} text has an unknown placeholder: {${unknown[0]}}. Check the spelling.` };
    }
    if (def.text.en.includes("{business_name}") && !body.includes("{business_name}")) {
      return { error: `Keep {business_name} in the ${name} text so customers know who's texting.` };
    }

    const { data: existing } = await supabase
      .from("message_templates")
      .select("id")
      .eq("org_id", org.id)
      .eq("key", key)
      .eq("language", language)
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("message_templates").update({ body }).eq("id", existing.id)
      : await supabase.from("message_templates").insert({ org_id: org.id, key, language, category: def.category, body });
    if (error) return { error: "Couldn't save. Please try again." };
  }

  revalidatePath("/settings/templates");
  revalidatePath(`/settings/templates/${key}`);
  return { success: "Saved. New texts will use this wording." };
}
