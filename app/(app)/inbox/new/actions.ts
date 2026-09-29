"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { isLanguage } from "@/lib/business-types";
import { normalizeUSPhone } from "@/lib/phone";
import { addManualLead } from "@/lib/services/lead-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext();
  const phone = normalizeUSPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a 10-digit US phone number." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 100) || null;
  const language = String(formData.get("preferred_language") ?? org.default_language);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 5000) || null;

  let leadId: string;
  try {
    leadId = await addManualLead(createAdminClient(), org.id, {
      phone,
      name,
      language: isLanguage(language) ? language : "en",
      notes,
    });
  } catch {
    return { error: "Couldn't create the lead." };
  }
  redirect(`/inbox/${leadId}`);
}
