"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { generateApiKey } from "@/lib/agent/keys";
import { canConnectAi, isAccessLevel, levelsForRole } from "@/lib/agent/oauth";
import { requireAppContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";

export type KeyState = (FormState & { key?: string }) | undefined;

/** Owners always; office managers when the plan includes team AI access. */
async function requireAiAccess() {
  const ctx = await requireAppContext();
  if (!canConnectAi(ctx.role, ctx.plan)) redirect("/settings");
  return ctx;
}

export async function createAssistantKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const { org, userId, role } = await requireAiAccess();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "Name the key, e.g. \"Claude on my phone\"." };
  const requested = String(formData.get("access"));
  const access = isAccessLevel(requested) ? requested : "read";
  if (!levelsForRole(role).includes(access)) return { error: "Office managers can create keys up to \"Read and act\"." };

  const db = createAdminClient();
  const { count } = await db.from("api_keys").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("revoked_at", null);
  if ((count ?? 0) >= 10) return { error: "This business already has 10 active keys. Revoke one first." };

  const { key, prefix, hash } = generateApiKey();
  const { error } = await db.from("api_keys").insert({ org_id: org.id, name, key_prefix: prefix, key_hash: hash, access, created_by: userId });
  if (error) return { error: "Couldn't create the key. Please try again." };
  revalidatePath("/settings/assistants");
  return { success: "Key created. Copy it now: it won't be shown again.", key };
}

/** Owners can revoke any connection; office managers only their own. */
export async function revokeAssistantKey(id: string): Promise<void> {
  const { org, role, userId } = await requireAiAccess();
  let q = createAdminClient().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", org.id);
  if (role !== "owner") q = q.eq("created_by", userId);
  await q;
  revalidatePath("/settings/assistants");
}
