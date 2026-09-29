"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { validateRegistration, type RegistrationInput } from "@/lib/automation/a2p";
import { notifyOwner } from "@/lib/services/conversations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function read(formData: FormData): RegistrationInput {
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    brand_type: s("brand_type") === "sole_proprietor" ? "sole_proprietor" : "standard",
    legal_name: s("legal_name").slice(0, 200),
    ein: s("ein").slice(0, 20),
    business_address: s("business_address").slice(0, 300),
    website: s("website").slice(0, 200),
    contact_name: s("contact_name").slice(0, 100),
    contact_email: s("contact_email").slice(0, 200),
    contact_phone: s("contact_phone").slice(0, 30),
    use_case_description: s("use_case_description").slice(0, 2000),
    opt_in_description: s("opt_in_description").slice(0, 2000),
    sample_messages: formData.getAll("sample_messages").map((m) => String(m).trim().slice(0, 500)).filter(Boolean),
  };
}

export async function saveRegistration(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const input = read(formData);
  const submit = formData.get("intent") === "submit";
  if (submit) {
    const errors = validateRegistration(input);
    if (errors.length) return { error: errors[0] };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("a2p_registrations").update(input).eq("org_id", org.id);
  if (error) return { error: "Couldn't save. If your registration was already submitted, it can't be edited." };

  if (submit) {
    const db = createAdminClient();
    await db
      .from("a2p_registrations")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("org_id", org.id)
      .in("status", ["not_started", "rejected"]);
    await notifyOwner(db, org.id, {
      kind: "system",
      body: "Carrier registration submitted. We'll let you know when texting is approved.",
      link: "/settings/registration",
    });
  }
  revalidatePath("/settings/registration");
  return { success: submit ? "Submitted! We'll take it from here." : "Saved." };
}
