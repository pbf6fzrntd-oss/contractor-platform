import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/lib/business-types";
import type { Database } from "@/lib/database.types";
import type { MessageCategory } from "@/lib/templates/defaults";

/** Saves one language of a template (creating it if the business doesn't have it yet). */
export async function saveTemplateText(
  db: SupabaseClient<Database>,
  orgId: string,
  input: { key: string; language: Language; body: string; category: MessageCategory },
): Promise<boolean> {
  const { data: existing } = await db
    .from("message_templates")
    .select("id")
    .eq("org_id", orgId)
    .eq("key", input.key)
    .eq("language", input.language)
    .maybeSingle();
  const { error } = existing
    ? await db.from("message_templates").update({ body: input.body }).eq("id", existing.id)
    : await db.from("message_templates").insert({ org_id: orgId, ...input });
  return !error;
}
