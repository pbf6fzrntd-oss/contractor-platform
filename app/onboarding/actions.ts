"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { getAppContext, getUserId } from "@/lib/auth/context";
import { defaultTemplatesFor } from "@/lib/templates/defaults";
import { createClient } from "@/lib/supabase/server";
import { parseBusinessForm } from "@/lib/validation/business";

export async function createBusiness(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getUserId())) redirect("/login");
  if (await getAppContext()) redirect("/home");

  const parsed = parseBusinessForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const input = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: input.name,
    p_business_type: input.business_type,
    p_default_language: input.default_language,
    p_templates: defaultTemplatesFor(input.business_type),
    p_alert_phone: input.alert_phone ?? undefined,
    p_google_review_url: input.google_review_url ?? undefined,
  });
  if (error) {
    console.error("create_organization failed", error);
    return { error: "Something went wrong saving your business. Please try again." };
  }

  redirect("/home");
}
