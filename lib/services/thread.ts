import "server-only";
import type { ThreadItem } from "@/components/thread";
import { signedUrl } from "@/lib/files/storage";
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
  // Photos texted in: private files, shown with links that work for 5 minutes.
  const inboundIds = (messages ?? []).filter((m) => m.direction === "inbound").map((m) => m.id);
  const { data: files } = inboundIds.length
    ? await db.from("files").select("id, message_id, content_type, storage_path").eq("org_id", orgId).in("message_id", inboundIds).is("deleted_at", null).limit(100)
    : { data: [] };
  const photos = new Map<string, { id: string; contentType: string; url: string | null }[]>();
  for (const f of files ?? []) {
    const list = photos.get(f.message_id!) ?? [];
    list.push({ id: f.id, contentType: f.content_type, url: await signedUrl(f.storage_path) });
    photos.set(f.message_id!, list);
  }
  const items: ThreadItem[] = [
    ...(messages ?? []).map((m) => ({ type: "message" as const, ...m, photos: photos.get(m.id) })),
    ...(calls ?? []).map((c) => ({ type: "call" as const, ...c })),
  ];
  return items.sort((a, b) => a.created_at.localeCompare(b.created_at));
}
