"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { generateApiKey } from "@/lib/agent/keys";
import { isAccessLevel } from "@/lib/agent/oauth";
import { requireOwner } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

export type KeyState = (FormState & { key?: string }) | undefined;

export async function createAssistantKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const { org, userId } = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Name the key, e.g. \"Claude on my phone\"." };
  const requested = String(formData.get("access"));
  const access = isAccessLevel(requested) ? requested : "read";

  const db = createAdminClient();
  const { count } = await db.from("api_keys").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("revoked_at", null);
  if ((count ?? 0) >= 10) return { error: "You already have 10 active keys. Revoke one first." };

  const { key, prefix, hash } = generateApiKey();
  const { error } = await db.from("api_keys").insert({ org_id: org.id, name, key_prefix: prefix, key_hash: hash, access, created_by: userId });
  if (error) return { error: "Couldn't create the key. Please try again." };
  revalidatePath("/settings/assistants");
  return { success: "Key created. Copy it now: it won't be shown again.", key };
}

export async function revokeAssistantKey(id: string): Promise<void> {
  const { org } = await requireOwner();
  await createAdminClient().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", org.id);
  revalidatePath("/settings/assistants");
}
