/**
 * Upload rules for private files (photos, vaccine records, license copies).
 * Pure functions: we never trust the browser's file type; we look at the
 * file's first bytes. SVG, HTML and anything executable are never accepted.
 */

export const FILE_KINDS = ["photo", "document", "vaccination_record", "credential"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export type AllowedType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "application/pdf";

const IMAGES: AllowedType[] = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * 4 MB: hosting (Vercel) caps a request at 4.5 MB, and phones shrink photos
 * before uploading (components/file-upload.tsx), so real photos fit easily.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const KIND_RULES: Record<FileKind, { types: AllowedType[]; label: string }> = {
  photo: { types: IMAGES, label: "photo" },
  document: { types: [...IMAGES, "application/pdf"], label: "document" },
  vaccination_record: { types: [...IMAGES, "application/pdf"], label: "vaccination record" },
  credential: { types: [...IMAGES, "application/pdf"], label: "license or insurance copy" },
};

export const EXTENSION: Record<AllowedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

/** What the file really is, from its first bytes (null if it's not something we accept). */
export function sniffType(head: Uint8Array): AllowedType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 4) === "PNG" && head[4] === 0x0d && head[5] === 0x0a) return "image/png";
  if (head.length >= 12 && ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") return "image/webp";
  if (head.length >= 12 && ascii(head, 4, 8) === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(ascii(head, 8, 12))) return "image/heic";
  if (head.length >= 5 && ascii(head, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export type UploadCheck = { ok: true; type: AllowedType } | { ok: false; error: string };

export function validateUpload(input: { kind: FileKind; size: number; head: Uint8Array }): UploadCheck {
  const rule = KIND_RULES[input.kind];
  if (input.size <= 0) return { ok: false, error: "That file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That file is too big (4 MB max). Try a smaller photo or a PDF scan." };
  const type = sniffType(input.head);
  if (!type || !rule.types.includes(type)) {
    return {
      ok: false,
      error: rule.types.includes("application/pdf")
        ? `A ${rule.label} must be a photo (JPG, PNG, WebP, HEIC) or a PDF.`
        : `A ${rule.label} must be a JPG, PNG, WebP or HEIC image.`,
    };
  }
  return { ok: true, type };
}

/** Where a file lives in the private bucket. The business id comes first so storage rules can check it. */
export function storagePath(orgId: string, fileId: string, type: AllowedType, now = new Date()): string {
  return `${orgId}/${now.getUTCFullYear()}/${fileId}.${EXTENSION[type]}`;
}

/** A display-safe version of the uploaded file's name. */
export function cleanFileName(name: string | null | undefined): string | null {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^\w.\- ]+/g, "").trim().slice(0, 120);
  return cleaned || null;
}

/** How long a signed link to a private file works. */
export const SIGNED_URL_SECONDS = 5 * 60;
