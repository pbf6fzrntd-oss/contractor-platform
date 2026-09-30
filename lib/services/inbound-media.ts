import "server-only";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { isTwilioMediaUrl, MAX_MEDIA_PER_TEXT, type MediaRef } from "@/lib/files/mms";
import { putFile } from "@/lib/files/storage";
import { MAX_UPLOAD_BYTES, storagePath, validateUpload } from "@/lib/files/validate";
import type { AdminClient } from "@/lib/supabase/admin";

/** A photo from a text: a Twilio address to download, or the bytes themselves (simulator). */
export type InboundMedia = MediaRef | { bytes: Uint8Array; contentType: string };

const DOWNLOAD_TIMEOUT_MS = 10_000;

/** Downloads one attachment from Twilio (with the account's login), refusing anything too big. */
async function download(url: string): Promise<Uint8Array | null> {
  if (!isTwilioMediaUrl(url)) return null;
  const auth = Buffer.from(`${serverEnv.twilioAccountSid}:${serverEnv.twilioAuthToken}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: "follow" });
  if (!res.ok || !res.body) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Saves photos (and PDFs) a customer texted in to PRIVATE storage, linked to
 * their text. Same checks as uploads: the real file type is read from its first
 * bytes (videos, contact cards and anything else are skipped) and size is capped.
 */
export async function saveInboundMedia(
  db: AdminClient,
  input: { orgId: string; contactId: string; messageId: string; media: InboundMedia[] },
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;
  for (const m of input.media.slice(0, MAX_MEDIA_PER_TEXT)) {
    try {
      const bytes = "bytes" in m ? m.bytes : await download(m.url);
      if (!bytes) {
        skipped += 1;
        continue;
      }
      const check = validateUpload({ kind: "document", size: bytes.byteLength, head: bytes.subarray(0, 16) });
      if (!check.ok) {
        skipped += 1;
        continue;
      }
      const id = randomUUID();
      const path = storagePath(input.orgId, id, check.type);
      await putFile(path, bytes, check.type);
      const { error } = await db.from("files").insert({
        id,
        org_id: input.orgId,
        contact_id: input.contactId,
        message_id: input.messageId,
        kind: check.type === "application/pdf" ? "document" : "photo",
        storage_path: path,
        content_type: check.type,
        size_bytes: bytes.byteLength,
        original_name: "Texted in",
      });
      if (error) skipped += 1;
      else saved += 1;
    } catch {
      skipped += 1;
    }
  }
  return { saved, skipped };
}
