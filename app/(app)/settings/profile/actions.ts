"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireOwner } from "@/lib/auth/context";
import { canUse } from "@/lib/entitlements";
import { profileSettingsSchema, SLUG_RULE, slugify } from "@/lib/public/profile";
import { createClient } from "@/lib/supabase/server";

const RESERVED = new Set(["admin", "api", "app", "book", "login", "signup", "settings", "www", "help", "support"]);

export async function saveProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org, plan, modules } = await requireOwner();
  if (!canUse(plan, modules, "agent_ready")) return { error: "Your public profile is part of the Executive plan or the Agent Ready add-on." };
  const slug = slugify(String(formData.get("slug") ?? "") || org.name);
  if (!SLUG_RULE.test(slug) || RESERVED.has(slug)) return { error: "Pick a web address of 3–50 letters, numbers and dashes." };
  const settings = profileSettingsSchema.safeParse({
    about: String(formData.get("about") ?? ""),
    service_area: String(formData.get("service_area") ?? ""),
    show_prices: formData.get("show_prices") === "on",
  });
  if (!settings.success) return { error: "Keep the description under 1,000 characters and the area under 300." };
  const { error } = await (await createClient())
    .from("organizations")
    .update({ slug, public_profile_enabled: formData.get("enabled") === "on", profile: settings.data })
    .eq("id", org.id);
  if (error) return { error: error.code === "23505" ? "That web address is taken. Try another." : "Couldn't save. Please try again." };
  revalidatePath("/settings/profile");
  revalidatePath(`/b/${slug}`);
  return { success: "Saved." };
}
