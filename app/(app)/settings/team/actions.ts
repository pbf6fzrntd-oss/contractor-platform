"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function createInvite(): Promise<void> {
  const { org } = await requireOwner();
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({ org_id: org.id });
  if (error) {
    // Most likely cause: the person isn't the owner. Nothing to show; the page reloads unchanged.
    console.error("create invitation failed", error);
  }
  revalidatePath("/settings/team");
}

export async function deleteInvite(inviteId: string): Promise<void> {
  const { org } = await requireOwner();
  const supabase = await createClient();
  await supabase.from("invitations").delete().eq("id", inviteId).eq("org_id", org.id);
  revalidatePath("/settings/team");
}

export async function removeMember(userId: string): Promise<void> {
  const { org } = await requireOwner();
  const supabase = await createClient();
  const { data: removed } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", userId).select("user_id");
  // Their AI connections stop working anyway (checked on every use); revoke them so the list stays tidy.
  if (removed?.length) {
    await createAdminClient().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("org_id", org.id).eq("created_by", userId).is("revoked_at", null);
  }
  revalidatePath("/settings/team");
}
