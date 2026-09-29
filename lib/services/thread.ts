import "server-only";
import type { ThreadItem } from "@/components/thread";
import type { AdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type AnyClient = AdminClient | Awaited<ReturnType<typeof createClient>>;

/** All texts and calls with one contact, oldest first. */
export async function loadThread(db: AnyClient, orgId: string, contactId: string): Promise<ThreadItem[]> {
  const [{ data: messages }, { data: calls }] = await Promise.all([
    db
      .from("messages")
      .select("id, created_at, direction, body, status, error, sender_type, flag")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at")
      .limit(500),
    db
      .from("calls")
      .select("id, created_at, status, text_back_sent")
      .eq("org_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at")
      .limit(200),
  ]);
  const items: ThreadItem[] = [
    ...(messages ?? []).map((m) => ({ type: "message" as const, ...m })),
    ...(calls ?? []).map((c) => ({ type: "call" as const, ...c })),
  ];
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
