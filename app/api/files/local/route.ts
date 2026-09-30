import { serverEnv } from "@/lib/env";
import { readLocalFile, verifyLocalSignature } from "@/lib/files/storage";
import { EXTENSION } from "@/lib/files/validate";

/** Serves a private file in "local" storage mode, only with a valid, unexpired signed link. */
export async function GET(request: Request) {
  if (serverEnv.fileStorage !== "local") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const storagePath = url.searchParams.get("path") ?? "";
  if (!/^[0-9a-f-]{36}\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp|heic|pdf)$/.test(storagePath)) return new Response("Not found", { status: 404 });
  if (!verifyLocalSignature(storagePath, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) {
    return new Response("This link expired. Reload the page for a new one.", { status: 403 });
  }
  const ext = storagePath.split(".").pop()!;
  const type = (Object.entries(EXTENSION).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream") as string;
  try {
    const body = await readLocalFile(storagePath);
    return new Response(new Uint8Array(body), {
      headers: { "content-type": type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
