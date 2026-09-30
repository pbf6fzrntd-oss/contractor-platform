"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { parseCredentialForm } from "@/lib/credentials";
import { createClient } from "@/lib/supabase/server";

export async function addCredential(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireOwner();
  const parsed = parseCredentialForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { count } = await supabase.from("business_credentials").select("id", { count: "exact", head: true }).eq("org_id", org.id);
  if ((count ?? 0) >= 30) return { error: "That's a lot of licenses! Remove an old one first." };
  const { error } = await supabase.from("business_credentials").insert({ org_id: org.id, ...parsed.data });
  if (error) return { error: "Couldn't save. Please try again." };
  revalidatePath("/settings/licenses");
  return { success: "Added." };
}

export async function deleteCredential(id: string): Promise<void> {
  const { org } = await requireOwner();
  await (await createClient()).from("business_credentials").delete().eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings/licenses");
}

export async function toggleCredentialOnProfile(id: string, show: boolean): Promise<void> {
  const { org } = await requireOwner();
  await (await createClient()).from("business_credentials").update({ show_on_profile: show }).eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings/licenses");
}
