import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { publicEnv, serverEnv } from "@/lib/env";
import { SIGNED_URL_SECONDS } from "@/lib/files/validate";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Private file storage. Files are never public: the app hands out links that
 * stop working after 5 minutes. "supabase" = the private bucket; "local" = a
 * folder on this computer (demos/tests, like the texting simulator).
 */
export const BUCKET = "private-files";
const LOCAL_ROOT = path.join(process.cwd(), ".data", "uploads");

function localFile(storagePath: string): string {
  const full = path.resolve(LOCAL_ROOT, storagePath);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("bad path");
  return full;
}

function sign(storagePath: string, expires: number): string {
  return createHmac("sha256", serverEnv.fileSigningSecret).update(`${storagePath}|${expires}`).digest("base64url");
}

/** Checks a local signed link (used by /api/files/local). */
export function verifyLocalSignature(storagePath: string, expires: number, signature: string, now = Date.now()): boolean {
  if (!Number.isFinite(expires) || expires * 1000 < now) return false;
  const expected = Buffer.from(sign(storagePath, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function readLocalFile(storagePath: string): Promise<Buffer> {
  return readFile(localFile(storagePath));
}

export async function putFile(storagePath: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (serverEnv.fileStorage === "local") {
    const full = localFile(storagePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return;
  }
  const { error } = await createAdminClient().storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: false });
  if (error) throw error;
}

export async function removeFile(storagePath: string): Promise<void> {
  if (serverEnv.fileStorage === "local") return; // local demo files are left in place
  await createAdminClient().storage.from(BUCKET).remove([storagePath]);
}

/** A link to one private file that works for 5 minutes. */
export async function signedUrl(storagePath: string): Promise<string | null> {
  if (serverEnv.fileStorage === "local") {
    const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_SECONDS;
    const q = new URLSearchParams({ path: storagePath, exp: String(expires), sig: sign(storagePath, expires) });
    return `${publicEnv.siteUrl}/api/files/local?${q}`;
  }
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}
