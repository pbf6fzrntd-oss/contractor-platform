"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/components/form-message";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(token: string): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  // The database writes plain-English messages for the problems people can fix.
  if (error) return { error: error.message };
  redirect("/home");
}
