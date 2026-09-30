import "server-only";
import { randomUUID } from "node:crypto";
import type { SubjectType } from "@/lib/industries/types";
import { putFile, signedUrl } from "@/lib/files/storage";
import { cleanFileName, storagePath, validateUpload, type FileKind } from "@/lib/files/validate";
import type { AdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

type UserClient = Awaited<ReturnType<typeof createClient>>;

export type SubjectWithDetails = {
  id: string;
  kind: SubjectType;
  label: string;
  attributes: Record<string, unknown>;
  private: { access_notes: string | null; vin: string | null; behavior_notes: string | null; care_notes: string | null } | null;
  files: { id: string; kind: string; content_type: string; original_name: string | null; url: string | null; expires_on: string | null; document_type: string | null }[];
};

/**
 * A customer's records WITH private details and signed file links, for the
 * business's own team screens only (row-level security limits it to members).
 * Never pass this to AI tools, texts or public pages: use shareableSubject().
 */
export async function loadSubjectsForTeam(supabase: UserClient, orgId: string, contactId: string): Promise<SubjectWithDetails[]> {
  const { data: subjects } = await supabase
    .from("subjects")
    .select("id, kind, label, attributes")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .is("archived_at", null)
    .order("created_at");
  const ids = (subjects ?? []).map((s) => s.id);
  if (!ids.length) return [];
  const [{ data: priv }, { data: files }] = await Promise.all([
    supabase.from("subject_private").select("subject_id, access_notes, vin, behavior_notes, care_notes").in("subject_id", ids),
    supabase
      .from("files")
      .select("id, subject_id, kind, content_type, original_name, storage_path, expires_on, document_type")
      .eq("org_id", orgId)
      .in("subject_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);
  const urls = new Map(await Promise.all((files ?? []).map(async (f) => [f.id, await signedUrl(f.storage_path)] as const)));
  return (subjects ?? []).map((s) => {
    const p = priv?.find((x) => x.subject_id === s.id);
    return {
      id: s.id,
      kind: s.kind as SubjectType,
      label: s.label,
      attributes: (s.attributes ?? {}) as Record<string, unknown>,
      private: p ? { access_notes: p.access_notes, vin: p.vin, behavior_notes: p.behavior_notes, care_notes: p.care_notes } : null,
      files: (files ?? [])
        .filter((f) => f.subject_id === s.id)
        .map((f) => ({ id: f.id, kind: f.kind, content_type: f.content_type, original_name: f.original_name, url: urls.get(f.id) ?? null, expires_on: f.expires_on, document_type: f.document_type })),
    };
  });
}

/** Saves a record and its private details (both through row-level security). */
export async function saveSubject(
  supabase: UserClient,
  orgId: string,
  input: { subjectId: string | null; contactId: string; kind: SubjectType; label: string; attributes: Record<string, string | number | boolean>; privateFields: Record<string, string | null> },
): Promise<string | null> {
  let id = input.subjectId;
  if (id) {
    const { data } = await supabase.from("subjects").update({ label: input.label, attributes: input.attributes }).eq("id", id).eq("org_id", orgId).select("id");
    if (!data?.length) return null;
  } else {
    const { data } = await supabase
      .from("subjects")
      .insert({ org_id: orgId, contact_id: input.contactId, kind: input.kind, label: input.label, attributes: input.attributes })
      .select("id")
      .single();
    if (!data) return null;
    id = data.id;
  }
  await supabase.from("subject_private").upsert({ subject_id: id, org_id: orgId, ...input.privateFields }, { onConflict: "subject_id" });
  return id;
}

/**
 * Stores one uploaded file in private storage after checking its real type
 * and size. The caller must already have checked the user belongs to orgId
 * and that subjectId/contactId belong to that business.
 */
export async function storeUpload(
  db: AdminClient,
  input: { orgId: string; contactId: string | null; subjectId: string | null; kind: FileKind; file: File; userId: string; documentType?: string | null; expiresOn?: string | null },
): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const check = validateUpload({ kind: input.kind, size: bytes.byteLength, head: bytes.subarray(0, 16) });
  if (!check.ok) return check;
  const fileId = randomUUID();
  const path = storagePath(input.orgId, fileId, check.type);
  try {
    await putFile(path, bytes, check.type);
  } catch (e) {
    console.error("file upload failed", e);
    return { ok: false, error: "Couldn't upload the file. Please try again." };
  }
  const { error } = await db.from("files").insert({
    id: fileId,
    org_id: input.orgId,
    contact_id: input.contactId,
    subject_id: input.subjectId,
    // "Photo or file" uploads are filed as photos when they turn out to be images.
    kind: input.kind === "document" && check.type.startsWith("image/") ? "photo" : input.kind,
    document_type: input.documentType ?? null,
    expires_on: input.expiresOn ?? null,
    storage_path: path,
    content_type: check.type,
    size_bytes: bytes.byteLength,
    original_name: cleanFileName(input.file.name),
    uploaded_by: input.userId,
  });
  if (error) return { ok: false, error: "Couldn't save the file. Please try again." };
  return { ok: true, fileId };
}
