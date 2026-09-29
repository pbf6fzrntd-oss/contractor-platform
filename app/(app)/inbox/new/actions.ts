"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { isLanguage } from "@/lib/business-types";
import { normalizeUSPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

export async function addLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireAppContext();
  const phone = normalizeUSPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { error: "Enter a 10-digit US phone number." };
  const name = String(formData.get("name") ?? "").trim().slice(0, 100) || null;
  const language = String(formData.get("preferred_language") ?? org.default_language);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 5000) || null;

  const supabase = await createClient();
  let { data: contact } = await supabase.from("contacts").select("id").eq("org_id", org.id).eq("phone", phone).maybeSingle();
  if (!contact) {
    const inserted = await supabase
      .from("contacts")
      .insert({ org_id: org.id, phone, name, preferred_language: isLanguage(language) ? language : "en" })
      .select("id")
      .single();
    if (inserted.error) return { error: "Couldn't save the contact." };
    contact = inserted.data;
  }

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({ org_id: org.id, contact_id: contact.id, source: "manual", notes })
    .select("id")
    .single();
  if (error) return { error: "Couldn't create the lead." };
  redirect(`/inbox/${lead.id}`);
}
