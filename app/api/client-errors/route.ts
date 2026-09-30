import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/monitoring/report";

/**
 * Errors from visitors' browsers (the "Something went wrong" screen). Only
 * short strings are accepted, and at most a few per minute per server, so it
 * can't be used to flood the alert inbox.
 */
const body = z.object({
  name: z.string().max(100).optional(),
  message: z.string().max(1000),
  stack: z.string().max(6000).optional(),
  digest: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
});

let windowStart = 0;
let count = 0;
const PER_MINUTE = 20;

export async function POST(request: Request) {
  if (!process.env.SENTRY_DSN) return new NextResponse(null, { status: 204 });
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > PER_MINUTE) return new NextResponse(null, { status: 429 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const e = new Error(parsed.data.message);
  e.name = parsed.data.name ?? "Error";
  e.stack = parsed.data.stack;
  await reportError(e, { where: "browser", path: parsed.data.path, digest: parsed.data.digest });
  return new NextResponse(null, { status: 204 });
}
