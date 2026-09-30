"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requireAppContext } from "@/lib/auth/context";
import { removeFile } from "@/lib/files/storage";
import { getIndustry } from "@/lib/industries";
import { SUBJECT_TYPES, type SubjectType } from "@/lib/industries/types";
import { loadLeadForUser } from "@/lib/services/leads";
import { saveSubject, storeUpload } from "@/lib/services/subjects";
import { parseSubjectForm } from "@/lib/subjects/fields";
import { createAdminClient } from "@/lib/supabase/admin";

function kindFor(orgIndustry: string | null, requested: FormDataEntryValue | null): SubjectType {
  const k = SUBJECT_TYPES.find((t) => t === requested);
  return k ?? getIndustry(orgIndustry)?.subjectType ?? "property";
}

/** Adds or updates a customer's property / pet / vehicle, including private notes. */
export async function saveSubjectAction(leadId: string, subjectId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const kind = kindFor(ctx.org.industry, formData.get("kind"));
  const parsed = parseSubjectForm(kind, formData);
  if (!parsed.ok) return { error: parsed.error };
  const id = await saveSubject(loaded.supabase, ctx.org.id, {
    subjectId,
    contactId: loaded.contact.id,
    kind,
    label: parsed.label,
    attributes: parsed.attributes,
    privateFields: parsed.privateFields,
  });
  if (!id) return { error: "Couldn't save. Please try again." };
  revalidatePath(`/inbox/${leadId}`);
  return { success: "Saved." };
}

/** Uploads a photo or document to private storage for one of this customer's records. */
export async function uploadSubjectFile(leadId: string, subjectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  // The record must belong to this customer (and so to this business).
  const { data: subject } = await loaded.supabase.from("subjects").select("id").eq("id", subjectId).eq("contact_id", loaded.contact.id).maybeSingle();
  if (!subject) return { error: "Record not found." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a photo or file first." };
  const kind = formData.get("kind") === "vaccination_record" ? "vaccination_record" : formData.get("kind") === "document" ? "document" : "photo";
  const expires = String(formData.get("expires_on") ?? "");
  if (kind === "vaccination_record" && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || !formData.get("document_type"))) {
    return { error: "Pick the vaccine and the date it expires." };
  }
  const result = await storeUpload(createAdminClient(), {
    orgId: ctx.org.id,
    contactId: loaded.contact.id,
    subjectId,
    kind,
    file,
    userId: ctx.userId,
    documentType: String(formData.get("document_type") ?? "").replace(/[^a-z0-9_]/g, "").slice(0, 40) || null,
    expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : null,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/inbox/${leadId}`);
  return { success: "Uploaded." };
}

/** Files a photo the customer texted in under one of their records (optionally as a vaccine record with an expiry date). */
export async function fileTextedPhoto(leadId: string, fileId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return { error: "Lead not found." };
  const subjectId = String(formData.get("subject_id") ?? "");
  const { data: subject } = await loaded.supabase.from("subjects").select("id").eq("id", subjectId).eq("contact_id", loaded.contact.id).maybeSingle();
  if (!subject) return { error: "Pick which record it belongs to." };
  const type = String(formData.get("document_type") ?? "").replace(/[^a-z0-9_]/g, "").slice(0, 40);
  const expires = String(formData.get("expires_on") ?? "");
  const asVaccine = Boolean(type);
  if (asVaccine && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: "Add the date the vaccine expires." };
  const { data } = await createAdminClient()
    .from("files")
    .update(asVaccine ? { subject_id: subject.id, kind: "vaccination_record", document_type: type, expires_on: expires } : { subject_id: subject.id })
    .eq("id", fileId)
    .eq("org_id", ctx.org.id)
    .eq("contact_id", loaded.contact.id)
    .not("message_id", "is", null)
    .is("deleted_at", null)
    .select("id");
  if (!data?.length) return { error: "Couldn't file that photo. Refresh and try again." };
  revalidatePath(`/inbox/${leadId}`);
  return { success: "Filed." };
}

export async function deleteSubjectFile(leadId: string, fileId: string): Promise<void> {
  const ctx = await requireAppContext();
  const loaded = await loadLeadForUser(ctx, leadId);
  if (!loaded) return;
  const db = createAdminClient();
  const { data: file } = await db
    .from("files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", fileId)
    .eq("org_id", ctx.org.id)
    .eq("contact_id", loaded.contact.id)
    .is("deleted_at", null)
    .select("storage_path")
    .maybeSingle();
  if (file) await removeFile(file.storage_path);
  revalidatePath(`/inbox/${leadId}`);
}
